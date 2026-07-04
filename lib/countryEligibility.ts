export function countryEligibilityKey(value: string | null | undefined) {
  const compact = (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

  const aliases: Record<string, string> = {
    us: "unitedstates",
    usa: "unitedstates",
    unitedstates: "unitedstates",
    unitedstatesofamerica: "unitedstates",
    america: "unitedstates",

    uk: "unitedkingdom",
    gb: "unitedkingdom",
    gbr: "unitedkingdom",
    britain: "unitedkingdom",
    greatbritain: "unitedkingdom",
    unitedkingdom: "unitedkingdom",

    hk: "hongkong",
    hongkong: "hongkong",
    hongkongchina: "hongkong",
  };

  return aliases[compact] || compact;
}

export function countriesEligibilityMatch(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const leftKey = countryEligibilityKey(left);
  const rightKey = countryEligibilityKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}
