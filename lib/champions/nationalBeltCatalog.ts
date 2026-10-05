export type ChampionsNationalBeltCatalogRow = {
  slug: string;
  country: string;
  flag: string;
  managedTarget?: string;
  scope?: "national" | "regional";
};

export const CHAMPIONS_NATIONAL_BELT_CATALOG: ChampionsNationalBeltCatalogRow[] = [
  { slug: "canada", country: "Canada", flag: "🇨🇦" },
  { slug: "usa", country: "USA", flag: "🇺🇸" },
  { slug: "mexico", country: "Mexico", flag: "🇲🇽" },
  { slug: "uk", country: "UK", flag: "🇬🇧" },
  { slug: "brazil", country: "Brazil", flag: "🇧🇷" },
  { slug: "argentina", country: "Argentina", flag: "🇦🇷" },
  { slug: "netherlands", country: "Netherlands", flag: "🇳🇱" },
  { slug: "poland", country: "Poland", flag: "🇵🇱" },
  { slug: "austria", country: "Austria", flag: "🇦🇹" },
  { slug: "turkey", country: "Turkey", flag: "🇹🇷" },
  { slug: "egypt", country: "Egypt", flag: "🇪🇬" },
  { slug: "spain", country: "Spain", flag: "🇪🇸" },
  { slug: "hungary", country: "Hungary", flag: "🇭🇺" },
  { slug: "russia", country: "Russia", flag: "🇷🇺" },
  { slug: "kazakhstan", country: "Kazakhstan", flag: "🇰🇿" },
  { slug: "hong-kong", country: "Hong Kong", flag: "🇭🇰" },
  { slug: "singapore", country: "Singapore", flag: "🇸🇬" },
  { slug: "taiwan", country: "Taiwan", flag: "🇹🇼" },
  { slug: "switzerland", country: "Switzerland", flag: "🇨🇭" },
  { slug: "sweden", country: "Sweden", flag: "🇸🇪" },
  { slug: "ireland", country: "Ireland", flag: "🇮🇪" },
  { slug: "india", country: "India", flag: "🇮🇳" },
  { slug: "south-africa", country: "South Africa", flag: "🇿🇦" },
  { slug: "scotland", country: "Scotland", flag: "🏴" },
  { slug: "morocco", country: "Morocco", flag: "🇲🇦" },
  { slug: "algeria", country: "Algeria", flag: "🇩🇿" },
  { slug: "saudi-arabia", country: "Saudi Arabia", flag: "🇸🇦" },
  { slug: "iraq", country: "Iraq", flag: "🇮🇶" },
  { slug: "iran", country: "Iran", flag: "🇮🇷" },
  { slug: "italy", country: "Italy", flag: "🇮🇹" },
  { slug: "denmark", country: "Denmark", flag: "🇩🇰" },
  { slug: "greece", country: "Greece", flag: "🇬🇷" },
  { slug: "france", country: "France", flag: "🇫🇷" },
  { slug: "japan", country: "Japan", flag: "🇯🇵" },
  { slug: "germany", country: "Germany", flag: "🇩🇪" },
  { slug: "china", country: "China", flag: "🇨🇳" },
  { slug: "australia", country: "Australia", flag: "🇦🇺" },
  { slug: "finland", country: "Finland", flag: "🇫🇮" },
  { slug: "norway", country: "Norway", flag: "🇳🇴" },
  { slug: "philippines", country: "Philippines", flag: "🇵🇭" },
  {
    slug: "norse",
    country: "Norse",
    flag: "⚔️",
    managedTarget: "regional-norse",
    scope: "regional",
  },
  {
    slug: "southeast-asia",
    country: "Southeast Asia",
    flag: "🌏",
    managedTarget: "regional-southeast-asia",
    scope: "regional",
  },
];
