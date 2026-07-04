export type WoloMainnetNetworkAccountUse =
  | "Founder Reserve"
  | "Founder Operating"
  | "Community Treasury"
  | "Liquidity Reserve"
  | "Growth Reserve"
  | "Operations Reserve"
  | "Bounty Pool"
  | "Staking Pool"
  | "Faucet Wallet"
  | "Rewards Wallet"
  | "Bet Escrow"
  | "IBC Escrow"
  | "Payout Wallet"
  | "Relayer Wallet"
  | "Player Wallet"
  | "Retired Escrow"
  | "Retired Wallet"
  | "Network Module";

export type WoloMainnetNetworkAccountRole =
  | "founder"
  | "treasury"
  | "reserve"
  | "faucet"
  | "validator"
  | "bounty"
  | "escrow"
  | "payout"
  | "staking"
  | "relayer"
  | "user"
  | "module";

export type WoloMainnetNetworkAccount = {
  label: string;
  address: string;
  use: WoloMainnetNetworkAccountUse;
  role: WoloMainnetNetworkAccountRole;
};

export const WOLO_MAINNET_NETWORK_ACCOUNTS = [
  {
    label: "Founder Cold",
    address: "wolo1r8kvt7me33rsv9ldaczj03xjrld4yumx0c0jkg",
    use: "Founder Reserve",
    role: "founder",
  },
  {
    label: "Founder Operating / Emaren",
    address: "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e",
    use: "Founder Operating",
    role: "founder",
  },
  {
    label: "Founder Operating / Emaren Legacy",
    address: "wolo1yj2u283x3c25rdp34ytpju02xyaz47cx5g2ssj",
    use: "Founder Operating",
    role: "founder",
  },
  {
    label: "Founder Rewards",
    address: "wolo1tg04m57e52evgzjkn9ruwwkz626pfv9qfv27wy",
    use: "Rewards Wallet",
    role: "payout",
  },
  {
    label: "Community Treasury",
    address: "wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2",
    use: "Community Treasury",
    role: "treasury",
  },
  {
    label: "DEX Liquidity Reserve",
    address: "wolo1kwsmr9nzujwul6wmu4hqr90lel4ca4uy3l06en",
    use: "Liquidity Reserve",
    role: "reserve",
  },
  {
    label: "Faucet Growth Reserve",
    address: "wolo12c009ektp58rr0gkjz3nk8f4kgvfpfzwfk86l3",
    use: "Growth Reserve",
    role: "reserve",
  },
  {
    label: "Faucet Hot Wallet",
    address: "wolo1dshyzxffd0jj39k7gj9tq9hgsx96ylxamyp5g0",
    use: "Faucet Wallet",
    role: "faucet",
  },
  {
    label: "Validator Ops",
    address: "wolo1nalsh7y0hzp33j996c90yxqgerxxvgpqtumfjt",
    use: "Operations Reserve",
    role: "validator",
  },
  {
    label: "Ecosystem Bounties",
    address: "wolo1dmj5dnm7g9hmj005yzy5e5xcygudyt7wxzpxjq",
    use: "Bounty Pool",
    role: "bounty",
  },
  {
    label: "IBC Escrow: transfer/channel-0 to Osmosis",
    address: "wolo1a53udazy8ayufvy0s434pfwjcedzqv347h8lzn",
    use: "IBC Escrow",
    role: "escrow",
  },
  {
    label: "Bet Payout Signer",
    address: "wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu",
    use: "Payout Wallet",
    role: "payout",
  },
  {
    label: "Bet Escrow Signer",
    address: "wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p",
    use: "Bet Escrow",
    role: "escrow",
  },
  {
    label: "Legacy Bet Escrow",
    address: "wolo1t4jq7wd4x030t9f0yfqfq74pt4pmaep5nu67y4",
    use: "Retired Escrow",
    role: "escrow",
  },
  {
    label: "Retired Bet Payout",
    address: "wolo1cy04t5af0mr9d8n6rrzgr8e9j4vuf42nfg02q5",
    use: "Retired Wallet",
    role: "payout",
  },
  {
    label: "Old Retired Staking Wallet",
    address: "wolo1rmr39nd5gnnv5y5f66qtq367xfwvx9jt5w7ucr",
    use: "Retired Wallet",
    role: "staking",
  },
  {
    label: "Staking Wallet",
    address: "wolo18v9ugfdrnz2ll2ah5z2yqzm5kzlg3e7l7jy6rn",
    use: "Staking Pool",
    role: "staking",
  },
  {
    label: "Wolo-Osmosis Relayer Gas",
    address: "wolo1m8qzq92hkktgqp47aewzylkatk6c22vc8c4vgj",
    use: "Relayer Wallet",
    role: "relayer",
  },
  {
    label: "Jim",
    address: "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz",
    use: "Player Wallet",
    role: "user",
  },
  {
    label: "Sniper",
    address: "wolo1mcmckkr360n47wyc408xmlsv4tzw95kkczvfp9",
    use: "Player Wallet",
    role: "user",
  },
  {
    label: "Julio Alvarez",
    address: "wolo1n0yg6ltqxl05ljaqftvvtgec5qavf9a3uh090h",
    use: "Player Wallet",
    role: "user",
  },
  {
    label: "Emaren #2",
    address: "wolo1yyuu097eppte7qya48r3dth86smdl3sjyxg284",
    use: "Player Wallet",
    role: "user",
  },
  {
    label: "Zodiac",
    address: "wolo1xamdfayrjy8eauyy65uuvkepuvvcdtqlq6q39k",
    use: "Player Wallet",
    role: "user",
  },
  {
    label: "Ra 𓁛𓇳",
    address: "wolo198ajhn5atpw65u6z89z5hwfer2vx90u4ydxe7z",
    use: "Player Wallet",
    role: "user",
  },
  {
    label: "[BDB]Pigman",
    address: "wolo1ntal93v8c5wryq2d9puhks8l25zedhepyv8n5k",
    use: "Player Wallet",
    role: "user",
  },
  {
    label: "Module: bonded_tokens_pool",
    address: "wolo1fl48vsnmsdzcv85q5d2q4z5ajdha8yu3aqv4s2",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: distribution",
    address: "wolo1jv65s3grqf6v6jl3dp4t6c9t9rk99cd80ypxqz",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: fee_collector",
    address: "wolo17xpfvakm2amg962yls6f84z3kell8c5lczx6zq",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: gov",
    address: "wolo10d07y265gmmuvt4z0w9aw880jnsr700jjekllw",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: interchainaccounts",
    address: "wolo1vlthgax23ca9syk7xgaz347xmf4nunef0nnd9d",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: mint",
    address: "wolo1m3h30wlvsf8llruxtpukdvsy0km2kum8q2zzwa",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: nft",
    address: "wolo1hr93qzcjspaa32px0qqywlh9hf9a8plg8rrvw6",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: not_bonded_tokens_pool",
    address: "wolo1tygms3xhhs3yv487phx3dw4a95jn7t7lfqsyx7",
    use: "Network Module",
    role: "module",
  },
  {
    label: "Module: transfer",
    address: "wolo1yl6hdjhmkf37639730gffanpzndzdpmhxynn77",
    use: "Network Module",
    role: "module",
  },
] as const satisfies readonly WoloMainnetNetworkAccount[];

export function isWoloNetworkModuleAccount(account: WoloMainnetNetworkAccount) {
  return account.role === "module" || account.use === "Network Module";
}

export function isWoloNetworkRetiredAccount(account: WoloMainnetNetworkAccount) {
  return account.use === "Retired Wallet" || account.use === "Retired Escrow";
}

export function isWoloNetworkUserFacingAccount(account: WoloMainnetNetworkAccount) {
  return (
    account.role === "user" ||
    account.use === "Player Wallet" ||
    account.use === "Founder Operating" ||
    account.use === "Bounty Pool" ||
    account.use === "Bet Escrow"
  );
}

export function isWoloStakingReserveOperatorAccount(
  account: WoloMainnetNetworkAccount
) {
  const address = account.address.toLowerCase();

  return (
    address !== "wolo1yj2u283x3c25rdp34ytpju02xyaz47cx5g2ssj" &&
    account.role !== "user" &&
    account.role !== "module" &&
    account.role !== "staking" &&
    account.role !== "escrow" &&
    account.role !== "relayer" &&
    !isWoloNetworkRetiredAccount(account)
  );
}

export const WOLO_STAKING_RESERVE_OPERATOR_ADDRESSES =
  WOLO_MAINNET_NETWORK_ACCOUNTS.filter(
    isWoloStakingReserveOperatorAccount
  ).map((account) => account.address.toLowerCase());
