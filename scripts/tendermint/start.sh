#!/bin/bash
set -o errexit -o nounset -o pipefail
command -v shellcheck >/dev/null && shellcheck "$0"
gnused="$(command -v gsed || echo sed)"
gnused="$(command -v gsed || echo sed)"

# Tendermint settings must be specified
# Choose version from https://hub.docker.com/r/tendermint/tendermint/tags/
for SETTING in "TENDERMINT_IMAGE" "TENDERMINT_PORT" "TENDERMINT_NAME"; do
  if test -z "$(eval echo "\$$SETTING")"; then
    echo "\$$SETTING must be set when running this script"
    exit 1
  fi
done

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/tendermint.XXXXXXXXX")
chmod 777 "${TMP_DIR}"
echo "Using temporary dir $TMP_DIR"
LOGFILE="$TMP_DIR/tendermint.log"

docker run --rm \
  --user="$UID" \
  -v "${TMP_DIR}:${TENDERMINT_ROOT}" \
  "${TENDERMINT_IMAGE}" \
  init validator

# make sure we allow cors origins, only possible by modifying the config file
# https://github.com/tendermint/tendermint/issues/3216
#
# Tendermint <= 0.34 uses underscores
"$gnused" -i -e 's/^cors_allowed_origins =.*$/cors_allowed_origins = ["*"]/' "${TMP_DIR}/config/config.toml"
# Tendermint 0.35 uses dashes
"$gnused" -i -e 's/^cors-allowed-origins =.*$/cors-allowed-origins = ["*"]/' "${TMP_DIR}/config/config.toml"

# must enable tx index for search and subscribe
docker run --rm \
  --user="$UID" \
  --name "$TENDERMINT_NAME" \
  -p "${TENDERMINT_PORT}:26657" -v "${TMP_DIR}:${TENDERMINT_ROOT}" \
  -e "TM_TX_INDEX_INDEX_ALL_KEYS=true" \
  -e "PROXY_APP=kvstore" \
  -e "LOG_LEVEL=state:info,rpc:info,*:error" \
  "${TENDERMINT_IMAGE}" node \
  --rpc.laddr=tcp://0.0.0.0:26657 \
  >"$LOGFILE" 2>&1 &

echo "Tendermint running and logging into $LOGFILE"

if [ -n "${CI:-}" ]; then
  # Give process some time to come alive. No idea why this helps. Needed for CI.
  sleep 0.5

  # Debug start
  sleep 3
  cat "$LOGFILE"
fi
