export type WoloMainnetWalletAlias = {
  label: string;
  address: string;
  profileNameKeys?: readonly string[];
  role:
    | "founder"
    | "treasury"
    | "liquidity"
    | "faucet"
    | "validator"
    | "bounty"
    | "escrow"
    | "player"
    | "staking"
    | "relayer"
    | "payout"
    | "test";
};

export const WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS =
  "wolo1dshyzxffd0jj39k7gj9tq9hgsx96ylxamyp5g0";
export const WOLO_MAINNET_FAUCET_CLAIM_AMOUNT_UWOLO = "2000000";

export const WOLO_MAINNET_WALLET_ALIASES = [
  {
    label: "Founder Cold",
    address: "wolo1r8kvt7me33rsv9ldaczj03xjrld4yumx0c0jkg",
    role: "founder",
  },
  {
    label: "Community Treasury",
    address: "wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2",
    role: "treasury",
  },
  {
    label: "DEX Liquidity Reserve",
    address: "wolo1kwsmr9nzujwul6wmu4hqr90lel4ca4uy3l06en",
    role: "liquidity",
  },
  {
    label: "Faucet Growth Reserve",
    address: "wolo12c009ektp58rr0gkjz3nk8f4kgvfpfzwfk86l3",
    role: "faucet",
  },
  {
    label: "Validator Ops",
    address: "wolo1nalsh7y0hzp33j996c90yxqgerxxvgpqtumfjt",
    role: "validator",
  },
  {
    label: "Founder Operating / Emaren",
    address: "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e",
    profileNameKeys: ["emaren"],
    role: "founder",
  },
  {
    label: "Founder Rewards",
    address: "wolo1tg04m57e52evgzjkn9ruwwkz626pfv9qfv27wy",
    profileNameKeys: ["emaren"],
    role: "payout",
  },
  {
    label: "Ecosystem Bounties",
    address: "wolo1dmj5dnm7g9hmj005yzy5e5xcygudyt7wxzpxjq",
    role: "bounty",
  },
  {
    label: "Faucet Hot Wallet",
    address: WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS,
    profileNameKeys: ["emaren"],
    role: "faucet",
  },
  {
    label: "IBC Escrow: transfer/channel-0 to Osmosis",
    address: "wolo1a53udazy8ayufvy0s434pfwjcedzqv347h8lzn",
    role: "escrow",
  },
  {
    label: "Jim",
    address: "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz",
    role: "player",
  },
  {
    label: "Sniper",
    address: "wolo1mcmckkr360n47wyc408xmlsv4tzw95kkczvfp9",
    role: "player",
  },
  {
    label: "Julio Alvarez",
    address: "wolo1n0yg6ltqxl05ljaqftvvtgec5qavf9a3uh090h",
    profileNameKeys: ["julio alvarez", "julio"],
    role: "player",
  },
  {
    label: "Emaren #2",
    address: "wolo1yyuu097eppte7qya48r3dth86smdl3sjyxg284",
    role: "player",
  },
  {
    label: "Module: bonded_tokens_pool",
    address: "wolo1fl48vsnmsdzcv85q5d2q4z5ajdha8yu3aqv4s2",
    role: "validator",
  },
  {
    label: "Staking Wallet",
    address: "wolo18v9ugfdrnz2ll2ah5z2yqzm5kzlg3e7l7jy6rn",
    role: "staking",
  },
  {
    label: "Wolo-Osmosis Relayer Gas",
    address: "wolo1m8qzq92hkktgqp47aewzylkatk6c22vc8c4vgj",
    role: "relayer",
  },
  {
    label: "Bet Payout Signer",
    address: "wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu",
    role: "payout",
  },
  {
    label: "Bet Escrow Signer",
    address: "wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p",
    role: "escrow",
  },
  {
    label: "Legacy Bet Escrow",
    address: "wolo1t4jq7wd4x030t9f0yfqfq74pt4pmaep5nu67y4",
    role: "escrow",
  },
  {
    label: "Retired Bet Payout",
    address: "wolo1cy04t5af0mr9d8n6rrzgr8e9j4vuf42nfg02q5",
    role: "payout",
  },
  {
    label: "Module: distribution",
    address: "wolo1jv65s3grqf6v6jl3dp4t6c9t9rk99cd80ypxqz",
    role: "test",
  },
] as const satisfies readonly WoloMainnetWalletAlias[];

export const WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS: Record<string, string> =
  Object.fromEntries(
    WOLO_MAINNET_WALLET_ALIASES.map((wallet) => [
      wallet.address.toLowerCase(),
      wallet.label,
    ])
  );
