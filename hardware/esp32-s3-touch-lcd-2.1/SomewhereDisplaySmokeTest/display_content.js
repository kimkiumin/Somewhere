const DISPLAY_TEXT_LIMIT = 16;

function formatDistanceMeters(meters) {
  if (!Number.isFinite(meters) || meters < 0) {
    return '--';
  }

  if (meters >= 1000) {
    const kilometers = meters / 1000;
    return `${kilometers >= 10 ? kilometers.toFixed(0) : kilometers.toFixed(1)} km`;
  }

  return `${Math.round(meters)} m`;
}

function copyDisplayText(value, maxChars = DISPLAY_TEXT_LIMIT) {
  return String(value ?? '').slice(0, Math.max(0, maxChars));
}

function formatPriceBand(value) {
  const raw = String(value ?? '').trim();
  if (!raw || /^(상관\s*없음|무관|any|no preference)$/i.test(raw)) {
    return '-';
  }

  const numericValue = raw.replace(/[₩원,\s]/g, '');
  if (/^\d+(?:\.\d+)?$/.test(numericValue)) {
    return numericValue;
  }

  const withoutWonMarker = raw.replace(/[₩]/g, '').replace(/원/g, '').trim();
  return withoutWonMarker || '-';
}

function buildDisplayRows({ distanceMeters = 320, menu = 'TONKATSU', price = '상관없음' } = {}) {
  return {
    distance: formatDistanceMeters(distanceMeters),
    menu: copyDisplayText(menu),
    price: formatPriceBand(price),
  };
}

module.exports = {
  buildDisplayRows,
  copyDisplayText,
  formatPriceBand,
  formatDistanceMeters,
};
