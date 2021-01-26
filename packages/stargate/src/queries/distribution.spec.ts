/* eslint-disable @typescript-eslint/naming-convention */
import { coin, coins } from "@cosmjs/launchpad";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { adaptor34, Client as TendermintClient } from "@cosmjs/tendermint-rpc";
import { assertDefinedAndNotNull, sleep } from "@cosmjs/utils";

import { cosmos } from "../codec";
import { SigningStargateClient } from "../signingstargateclient";
import { assertIsBroadcastTxSuccess } from "../stargateclient";
import { faucet, pendingWithoutSimapp, simapp, simappEnabled, validator } from "../testutils.spec";
import { DistributionExtension, setupDistributionExtension } from "./distribution";
import { QueryClient } from "./queryclient";

type IMsgDelegate = cosmos.staking.v1beta1.IMsgDelegate;

async function makeClientWithDistribution(
  rpcUrl: string,
): Promise<[QueryClient & DistributionExtension, TendermintClient]> {
  const tmClient = await TendermintClient.connect(rpcUrl, adaptor34);
  return [QueryClient.withExtensions(tmClient, setupDistributionExtension), tmClient];
}

describe("DistributionExtension", () => {
  const defaultFee = {
    amount: coins(25000, "ucosm"),
    gas: "1500000", // 1.5 million
  };

  beforeAll(async () => {
    if (simappEnabled()) {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(faucet.mnemonic);
      const client = await SigningStargateClient.connectWithSigner(simapp.tendermintUrl, wallet);

      const msg: IMsgDelegate = {
        delegatorAddress: faucet.address0,
        validatorAddress: validator.validatorAddress,
        amount: coin(25000, "ustake"),
      };
      const msgAny = {
        typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
        value: msg,
      };
      const memo = "Test delegation for Stargate";
      const result = await client.signAndBroadcast(faucet.address0, [msgAny], defaultFee, memo);
      assertIsBroadcastTxSuccess(result);

      await sleep(75); // wait until transactions are indexed
    }
  });

  describe("unverified", () => {
    describe("communityPool", () => {
      it("works", async () => {
        pendingWithoutSimapp();
        const [client, tmClient] = await makeClientWithDistribution(simapp.tendermintUrl);

        const response = await client.distribution.unverified.communityPool();
        assertDefinedAndNotNull(response.pool);
        expect(response.pool.length).toBeGreaterThanOrEqual(1);

        tmClient.disconnect();
      });
    });
  });
});
