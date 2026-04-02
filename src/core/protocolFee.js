const DEFAULT_PROTOCOL_FEE_BPS = BigInt(28); // 0.28%
const MIN_PROTOCOL_FEE_BPS = BigInt(9); // router MIN_FEE

let protocolFeeBps = DEFAULT_PROTOCOL_FEE_BPS;

function normalizeProtocolFeeBps(feeRaw) {
    let fee;
    try {
        fee = BigInt(feeRaw);
    } catch {
        throw new Error(`Invalid protocol fee: "${feeRaw}"`);
    }

    if (fee < MIN_PROTOCOL_FEE_BPS) {
        throw new Error(
            `protocol fee cannot be below router min fee (${MIN_PROTOCOL_FEE_BPS.toString()}). Received: ${fee.toString()}`
        );
    }

    return fee;
}

function setProtocolFeeBps(nextFeeBps) {
    protocolFeeBps = normalizeProtocolFeeBps(nextFeeBps);
    return protocolFeeBps.toString();
}

function getProtocolFeeBps() {
    return protocolFeeBps.toString();
}

module.exports = {
    DEFAULT_PROTOCOL_FEE_BPS,
    MIN_PROTOCOL_FEE_BPS,
    normalizeProtocolFeeBps,
    setProtocolFeeBps,
    getProtocolFeeBps,
};
