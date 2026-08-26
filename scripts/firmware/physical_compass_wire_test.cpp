#include "physical_compass_protocol.h"
#include "display_copy.h"

#include <algorithm>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

namespace {

int failures = 0;
int checks = 0;

void expect(bool condition, const std::string &message) {
    ++checks;
    if (!condition) {
        ++failures;
        std::cerr << "FAIL: " << message << '\n';
    }
}

std::string stateFrame(
    uint32_t sequence,
    const std::string &menus = "[\"한식 국물 요리\"]",
    const std::string &actions = "[\"stop\",\"reveal\"]",
    const std::string &extra = ""
) {
    return "{\"v\":1,\"type\":\"state\",\"seq\":" + std::to_string(sequence) +
        ",\"phase\":\"following\",\"d\":420,\"b\":315,\"c\":\"credible\",\"m\":" +
        menus + ",\"p\":\"medium\",\"a\":" + actions +
        ",\"r\":false,\"ts\":1787659200000" + extra + "}\n";
}

void appendInChunks(physical_compass::BoardSession &session, const std::string &frame, size_t chunkSize) {
    for (size_t offset = 0; offset < frame.size(); offset += chunkSize) {
        const size_t length = std::min(chunkSize, frame.size() - offset);
        session.appendStateChunk(reinterpret_cast<const uint8_t *>(frame.data() + offset), length);
    }
}

void testStrictMonotonicSequenceAndEpochReset() {
    physical_compass::BoardSession session;
    session.beginConnection();

    appendInChunks(session, stateFrame(7), 4);
    physical_compass::BoardState accepted;
    expect(session.takePendingState(100, accepted), "first positive state is accepted");
    expect(accepted.sequence == 7, "first state sequence is retained");

    appendInChunks(session, stateFrame(7), 9);
    appendInChunks(session, stateFrame(6), 9);
    appendInChunks(session, stateFrame(0), 9);
    expect(!session.takePendingState(200, accepted), "duplicate, older, and zero states do not replace state");
    expect(session.acceptedState().sequence == 7, "rejected sequences preserve the last safe state");

    const uint64_t firstEpoch = session.connectionEpoch();
    session.disconnect();
    session.beginConnection();
    expect(session.connectionEpoch() > firstEpoch, "reconnect advances the connection epoch");
    appendInChunks(session, stateFrame(1), 5);
    expect(session.takePendingState(300, accepted), "new epoch accepts a low positive sequence");
    expect(accepted.sequence == 1, "new epoch sequence starts independently");
}

void testDisconnectClearsFreshnessAndActionAuthority() {
    physical_compass::BoardSession session;
    session.beginConnection();
    appendInChunks(session, stateFrame(42), 32);
    physical_compass::BoardState accepted;
    expect(session.takePendingState(1000, accepted), "state is applied before disconnect test");
    expect(session.hasFreshState(1001), "accepted state is fresh before disconnect");
    expect(session.canEmitAction("stop", 42, 1001), "advertised action is available while fresh");

    const std::string partial = "{\"v\":1,\"type\":\"state\",\"seq\":43";
    session.appendStateChunk(reinterpret_cast<const uint8_t *>(partial.data()), partial.size());
    session.disconnect();

    expect(!session.hasFreshState(1002), "disconnect clears freshness atomically");
    expect(!session.canEmitAction("stop", 42, 1002), "disconnect clears action authority");
    expect(!session.takePendingState(1003, accepted), "disconnect clears queued and partial state");
    expect(session.acceptedState().sequence == 0, "disconnect clears visible state sequence");
}

void testUtf8BoundariesAndMalformedFrames() {
    const std::string fortyAscii(40, 'a');
    const std::string fortyOneAscii(41, 'a');
    const std::string thirteenKorean = "가가가가가가가가가가가가가";
    const std::string fourteenKorean = thirteenKorean + "가";

    expect(physical_compass::isValidUtf8(fortyAscii), "ASCII is valid UTF-8");
    expect(physical_compass::isValidDisplayText(fortyAscii), "40 UTF-8 bytes are allowed");
    expect(!physical_compass::isValidDisplayText(fortyOneAscii), "41 UTF-8 bytes are rejected");
    expect(physical_compass::isValidDisplayText(thirteenKorean), "39 Korean UTF-8 bytes are allowed");
    expect(!physical_compass::isValidDisplayText(fourteenKorean), "42 Korean UTF-8 bytes are rejected");
    expect(!physical_compass::isValidUtf8(std::string("\xE3\x81", 2)), "truncated UTF-8 is rejected");

    const std::string truncated = physical_compass::truncateDisplayText(fortyOneAscii + "가");
    expect(truncated.size() == 40, "display truncation obeys the byte boundary");
    expect(physical_compass::isValidUtf8(truncated), "display truncation preserves UTF-8");

    physical_compass::BoardState state;
    expect(!physical_compass::parseStateFrame(
                reinterpret_cast<const uint8_t *>("{\"v\":1,\"type\":\"state\",\"seq\":1,\"phase\":\"\xE3\x81\",\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n"),
                105,
                state),
        "malformed UTF-8 state is rejected");
    expect(!physical_compass::parseStateFrame(
                reinterpret_cast<const uint8_t *>(stateFrame(1, "[\"" + fortyOneAscii + "\"]").data()),
                stateFrame(1, "[\"" + fortyOneAscii + "\"]").size(),
                state),
        "over-limit display text is rejected");

    std::string oversized(physical_compass::kMaxFrameBytes, 'x');
    oversized.push_back('\n');
    expect(!physical_compass::parseStateFrame(
                reinterpret_cast<const uint8_t *>(oversized.data()), oversized.size(), state),
        "oversized logical frame is rejected");

    const std::string versionFrame = "{\"v\":2,\"type\":\"state\",\"seq\":1,\"phase\":\"following\",\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    expect(!physical_compass::parseStateFrame(
                reinterpret_cast<const uint8_t *>(versionFrame.data()), versionFrame.size(), state),
        "unknown state version is rejected");
    const std::string nonFiniteFrame = "{\"v\":1,\"type\":\"state\",\"seq\":1,\"phase\":\"following\",\"d\":1e999,\"c\":\"credible\",\"m\":[],\"a\":[],\"r\":false,\"ts\":1}\n";
    expect(!physical_compass::parseStateFrame(
                reinterpret_cast<const uint8_t *>(nonFiniteFrame.data()), nonFiniteFrame.size(), state),
        "non-finite numeric state is rejected");
    const std::string unknownActionFrame = stateFrame(1, "[]", "[\"review\"]");
    expect(!physical_compass::parseStateFrame(
                reinterpret_cast<const uint8_t *>(unknownActionFrame.data()), unknownActionFrame.size(), state),
        "unknown action is rejected");
}

void testReassemblyCoalescingAndOversizeRecovery() {
    physical_compass::BoardSession session;
    session.beginConnection();
    const std::string frames = stateFrame(1) + stateFrame(2) + stateFrame(3);
    session.appendStateChunk(reinterpret_cast<const uint8_t *>(frames.data()), frames.size());

    physical_compass::BoardState accepted;
    expect(session.takePendingState(10, accepted), "coalesced complete frames produce one pending state");
    expect(accepted.sequence == 3, "coalescing retains the latest complete state");

    const std::string oversizedLine(physical_compass::kMaxFrameBytes + 50, 'x');
    const std::string recovery = oversizedLine + "\n" + stateFrame(4);
    session.appendStateChunk(reinterpret_cast<const uint8_t *>(recovery.data()), recovery.size());
    expect(session.takePendingState(20, accepted), "oversized line rejection recovers at the next newline");
    expect(accepted.sequence == 4, "valid frame after oversized line is still accepted");
}

void testPendingNewerStateSuppressesOlderActions() {
    physical_compass::BoardSession session;
    session.beginConnection();
    appendInChunks(session, stateFrame(8, "[]", "[\"stop\"]"), 13);
    physical_compass::BoardState accepted;
    expect(session.takePendingState(100, accepted), "accepted state is available before pending-state guard");
    expect(session.canEmitAction("stop", 8, 101), "accepted state can authorize before a newer state arrives");

    appendInChunks(session, stateFrame(9, "[]", "[\"reveal\"]"), 13);
    expect(!session.canEmitAction("stop", 8, 102), "older accepted action is blocked while newer state is pending");
    expect(!session.canEmitAction("reveal", 9, 102), "pending state is not actionable before application");
    expect(session.takePendingState(103, accepted), "newer state is eventually applied");
    expect(session.canEmitAction("reveal", 9, 104), "newly accepted state restores only its advertised action");
}

void testJsonDepthLimitAndSafePriceFallback() {
    std::string nested = "\"category\"";
    constexpr size_t expectedMaxJsonDepth = 8;
    for (size_t depth = 0; depth < expectedMaxJsonDepth + 2; ++depth) {
        nested = "[" + nested + "]";
    }
    const std::string deepFrame = stateFrame(1, nested);
    physical_compass::BoardState state;
    expect(!physical_compass::parseStateFrame(
                reinterpret_cast<const uint8_t *>(deepFrame.data()), deepFrame.size(), state),
        "JSON nesting beyond the parser budget is rejected before materialization");

    expect(physical_compass::display::priceText("low") == "가벼운 가격대", "low price code has Korean copy");
    expect(physical_compass::display::priceText("medium") == "보통 가격대", "medium price code has Korean copy");
    expect(physical_compass::display::priceText("high") == "높은 가격대", "high price code has Korean copy");
    expect(physical_compass::display::priceText("<arbitrary destination text>") == "가격 미정",
        "unknown price text falls back instead of rendering wire data");
}

void testFourActionContractAndGuards() {
    expect(physical_compass::actionIndex("stop") == physical_compass::kStop, "stop is an allowed action");
    expect(physical_compass::actionIndex("continue") == physical_compass::kContinue, "continue is an allowed action");
    expect(physical_compass::actionIndex("confirm-stop") == physical_compass::kConfirmStop, "confirm-stop is an allowed action");
    expect(physical_compass::actionIndex("reveal") == physical_compass::kReveal, "reveal is an allowed action");
    expect(physical_compass::actionIndex("review") == physical_compass::kActionCount, "review is removed from the contract");
    expect(physical_compass::encodeEvent("review", 1).empty(), "review cannot be encoded");
    expect(physical_compass::encodeEvent("stop", 0).empty(), "zero event sequence cannot be encoded");

    physical_compass::BoardSession session;
    session.beginConnection();
    appendInChunks(session, stateFrame(8, "[]", "[\"stop\",\"reveal\"]"), 11);
    physical_compass::BoardState accepted;
    expect(session.takePendingState(100, accepted), "action fixture state is accepted");
    expect(session.canEmitAction("stop", 8, 101), "matching advertised action and sequence emit");
    expect(!session.canEmitAction("continue", 8, 101), "unadvertised action is suppressed");
    expect(!session.canEmitAction("stop", 7, 101), "stale action sequence is suppressed");
    expect(!session.canEmitAction("stop", 8, 6101), "stale state action is suppressed");
}

void testEventChunkingIsAttSafeAndOrdered() {
    const std::string frame = physical_compass::encodeEvent("confirm-stop", 31);
    expect(!frame.empty(), "event frame encodes");
    const auto negotiated = physical_compass::chunkEventFrame(frame, 23);
    std::string reconstructed;
    for (const auto &chunk : negotiated) {
        expect(chunk.size() <= 20, "MTU 23 event chunks fit the 20-byte ATT payload");
        reconstructed += chunk;
    }
    expect(reconstructed == frame, "negotiated ATT chunks preserve frame order and newline");

    const auto fallback = physical_compass::chunkEventFrame(frame, 0);
    reconstructed.clear();
    for (const auto &chunk : fallback) {
        expect(chunk.size() <= 20, "unknown MTU uses conservative 20-byte chunks");
        reconstructed += chunk;
    }
    expect(reconstructed == frame, "fallback chunks preserve one complete frame");
    expect(reconstructed.back() == '\n', "reassembled event retains its newline delimiter");
}

void testKoreanDisplayCopy() {
    physical_compass::BoardState state;
    state.menuCount = 2;
    state.menus[0] = "한식 국물 요리";
    state.menus[1] = "조용한 식사";
    state.priceBand = "medium";

    const std::string menu = physical_compass::display::menuText(state);
    const std::string price = physical_compass::display::priceText(state.priceBand);
    const std::string waiting = physical_compass::display::phaseStatus(false, false, false, false, true);
    expect(menu == "한식 국물 요리 / 조용한 식사", "Korean categories are rendered without a placeholder");
    expect(price == "보통 가격대", "price taxonomy uses Korean display copy");
    expect(waiting == "새 안내 대기", "waiting copy is compact and Korean");
    expect(menu.find(std::string("C") + "LUE") == std::string::npos, "Korean category copy has no placeholder surface");
}

}  // namespace

int main() {
    testStrictMonotonicSequenceAndEpochReset();
    testDisconnectClearsFreshnessAndActionAuthority();
    testUtf8BoundariesAndMalformedFrames();
    testReassemblyCoalescingAndOversizeRecovery();
    testPendingNewerStateSuppressesOlderActions();
    testJsonDepthLimitAndSafePriceFallback();
    testFourActionContractAndGuards();
    testEventChunkingIsAttSafeAndOrdered();
    testKoreanDisplayCopy();

    if (failures != 0) {
        std::cerr << failures << " host firmware assertions failed\n";
        return 1;
    }
    std::cout << "firmware host tests: 9 suites, " << checks << " assertions passed\n";
    return 0;
}
