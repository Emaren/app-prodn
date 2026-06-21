export function countryRegionDisplayName(country: string | null | undefined) {
  const value = String(country || "").trim();

  if (!value) {
    return "AoE2WAR";
  }

  const aliases: Record<string, string> = {
    USA: "United States",
    US: "United States",
    UK: "United Kingdom",
  };

  return aliases[value] || value;
}

export function flagEmojiForCountryRegion(country: string | null | undefined) {
  const value = String(country || "").trim();

  const flags: Record<string, string> = {
    Afghanistan: "🇦🇫",
    Albania: "🇦🇱",
    Algeria: "🇩🇿",
    Argentina: "🇦🇷",
    Armenia: "🇦🇲",
    Australia: "🇦🇺",
    Austria: "🇦🇹",
    Bahamas: "🇧🇸",
    Bangladesh: "🇧🇩",
    Belarus: "🇧🇾",
    Belgium: "🇧🇪",
    Bolivia: "🇧🇴",
    Brazil: "🇧🇷",
    Bulgaria: "🇧🇬",
    Cambodia: "🇰🇭",
    Canada: "🇨🇦",
    Chile: "🇨🇱",
    China: "🇨🇳",
    Colombia: "🇨🇴",
    Croatia: "🇭🇷",
    "Czech Republic": "🇨🇿",
    Denmark: "🇩🇰",
    Ecuador: "🇪🇨",
    Egypt: "🇪🇬",
    England: "🏴",
    Finland: "🇫🇮",
    France: "🇫🇷",
    Georgia: "🇬🇪",
    Germany: "🇩🇪",
    Greece: "🇬🇷",
    "Hong Kong": "🇭🇰",
    Hungary: "🇭🇺",
    India: "🇮🇳",
    Indonesia: "🇮🇩",
    Iran: "🇮🇷",
    Ireland: "🇮🇪",
    Israel: "🇮🇱",
    Italy: "🇮🇹",
    Japan: "🇯🇵",
    Kazakhstan: "🇰🇿",
    Kosovo: "🇽🇰",
    Laos: "🇱🇦",
    Malaysia: "🇲🇾",
    Mexico: "🇲🇽",
    Mongolia: "🇲🇳",
    Morocco: "🇲🇦",
    Netherlands: "🇳🇱",
    "New Zealand": "🇳🇿",
    Norway: "🇳🇴",
    Pakistan: "🇵🇰",
    Palestine: "🇵🇸",
    Peru: "🇵🇪",
    Philippines: "🇵🇭",
    Poland: "🇵🇱",
    Portugal: "🇵🇹",
    Romania: "🇷🇴",
    Russia: "🇷🇺",
    Scotland: "🏴",
    Serbia: "🇷🇸",
    Singapore: "🇸🇬",
    Slovakia: "🇸🇰",
    Slovenia: "🇸🇮",
    "South Africa": "🇿🇦",
    "South Korea": "🇰🇷",
    Spain: "🇪🇸",
    Sweden: "🇸🇪",
    Switzerland: "🇨🇭",
    Taiwan: "🇹🇼",
    Thailand: "🇹🇭",
    Turkey: "🇹🇷",
    Ukraine: "🇺🇦",
    "United Arab Emirates": "🇦🇪",
    "United Kingdom": "🇬🇧",
    UK: "🇬🇧",
    "United States": "🇺🇸",
    USA: "🇺🇸",
    Vietnam: "🇻🇳",
    Wales: "🏴",
  };

  return flags[value] || "🌐";
}

export function countryRegionLabel(country: string | null | undefined) {
  const value = String(country || "").trim();

  if (!value) {
    return "AoE2WAR";
  }

  return `${flagEmojiForCountryRegion(value)} ${countryRegionDisplayName(value)}`;
}
