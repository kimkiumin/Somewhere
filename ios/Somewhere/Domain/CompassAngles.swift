import Foundation

enum CompassAngles {
    static func normalize(_ degrees: Double) -> Double {
        let remainder = degrees.truncatingRemainder(dividingBy: 360)
        return remainder >= 0 ? remainder : remainder + 360
    }

    static func signedDelta(from: Double, to: Double) -> Double {
        let raw = normalize(to) - normalize(from)
        if raw > 180 { return raw - 360 }
        if raw < -180 { return raw + 360 }
        return raw
    }
}
