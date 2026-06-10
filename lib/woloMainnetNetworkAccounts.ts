export type WoloMainnetNetworkAccountUse =
  | "NEVER_USER_FACING"
  | "PUBLIC_RECEIVE_OK"
  | "TREASURY_PUBLIC_BUT_DO_NOT_USE_FOR_RANDOM_USERS"
  | "RESERVE_NOT_USER_FACING"
  | "FAUCET_OPERATIONAL"
  | "OPS_NOT_USER_FACING"
  | "BOUNTIES_PUBLIC_OK"
  | "MODULE_ESCROW_DO_NOT_SEND_DIRECTLY"
  | "APP_SIGNER_NOT_USER_FACING"
  | "BET_DEPOSIT_ADDRESS_IF_MANUAL"
  | "RETIRED_DO_NOT_USE"
  | "STAKING_OPERATIONAL_NOT_GENERAL_RECEIVE"
  | "RELAYER_GAS_DO_NOT_USE"
  | "USER"
  | "MODULE_DO_NOT_USE";

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
    use: "NEVER_USER_FACING",
    role: "founder",
  },
  {
    label: "Founder Operating / Emaren",
    address: "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e",
    use: "PUBLIC_RECEIVE_OK",
    role: "founder",
  },
  {
    label: "Founder Rewards",
    address: "wolo1tg04m57e52evgzjkn9ruwwkz626pfv9qfv27wy",
    use: "APP_SIGNER_NOT_USER_FACING",
    role: "payout",
  },
  {
    label: "Community Treasury",
    address: "wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2",
    use: "TREASURY_PUBLIC_BUT_DO_NOT_USE_FOR_RANDOM_USERS",
    role: "treasury",
  },
  {
    label: "DEX Liquidity Reserve",
    address: "wolo1kwsmr9nzujwul6wmu4hqr90lel4ca4uy3l06en",
    use: "RESERVE_NOT_USER_FACING",
    role: "reserve",
  },
  {
    label: "Faucet Growth Reserve",
    address: "wolo12c009ektp58rr0gkjz3nk8f4kgvfpfzwfk86l3",
    use: "RESERVE_NOT_USER_FACING",
    role: "reserve",
  },
  {
    label: "Faucet Hot Wallet",
    address: "wolo1dshyzxffd0jj39k7gj9tq9hgsx96ylxamyp5g0",
    use: "FAUCET_OPERATIONAL",
    role: "faucet",
  },
  {
    label: "Validator Ops",
    address: "wolo1nalsh7y0hzp33j996c90yxqgerxxvgpqtumfjt",
    use: "OPS_NOT_USER_FACING",
    role: "validator",
  },
  {
    label: "Ecosystem Bounties",
    address: "wolo1dmj5dnm7g9hmj005yzy5e5xcygudyt7wxzpxjq",
    use: "BOUNTIES_PUBLIC_OK",
    role: "bounty",
  },
  {
    label: "IBC Escrow: transfer/channel-0 to Osmosis",
    address: "wolo1a53udazy8ayufvy0s434pfwjcedzqv347h8lzn",
    use: "MODULE_ESCROW_DO_NOT_SEND_DIRECTLY",
    role: "escrow",
  },
  {
    label: "Bet Payout Signer",
    address: "wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu",
    use: "APP_SIGNER_NOT_USER_FACING",
    role: "payout",
  },
  {
    label: "Bet Escrow Signer",
    address: "wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p",
    use: "BET_DEPOSIT_ADDRESS_IF_MANUAL",
    role: "escrow",
  },
  {
    label: "Legacy Bet Escrow",
    address: "wolo1t4jq7wd4x030t9f0yfqfq74pt4pmaep5nu67y4",
    use: "RETIRED_DO_NOT_USE",
    role: "escrow",
  },
  {
    label: "Retired Bet Payout",
    address: "wolo1cy04t5af0mr9d8n6rrzgr8e9j4vuf42nfg02q5",
    use: "RETIRED_DO_NOT_USE",
    role: "payout",
  },
  {
    label: "Old Retired Staking Wallet",
    address: "wolo1rmr39nd5gnnv5y5f66qtq367xfwvx9jt5w7ucr",
    use: "RETIRED_DO_NOT_USE",
    role: "staking",
  },
  {
    label: "Staking Wallet",
    address: "wolo18v9ugfdrnz2ll2ah5z2yqzm5kzlg3e7l7jy6rn",
    use: "STAKING_OPERATIONAL_NOT_GENERAL_RECEIVE",
    role: "staking",
  },
  {
    label: "Wolo-Osmosis Relayer Gas",
    address: "wolo1m8qzq92hkktgqp47aewzylkatk6c22vc8c4vgj",
    use: "RELAYER_GAS_DO_NOT_USE",
    role: "relayer",
  },
  {
    label: "Jim",
    address: "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz",
    use: "USER",
    role: "user",
  },
  {
    label: "Sniper",
    address: "wolo1mcmckkr360n47wyc408xmlsv4tzw95kkczvfp9",
    use: "USER",
    role: "user",
  },
  {
    label: "Julio Alvarez",
    address: "wolo1n0yg6ltqxl05ljaqftvvtgec5qavf9a3uh090h",
    use: "USER",
    role: "user",
  },
  {
    label: "Module: bonded_tokens_pool",
    address: "wolo1fl48vsnmsdzcv85q5d2q4z5ajdha8yu3aqv4s2",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: distribution",
    address: "wolo1jv65s3grqf6v6jl3dp4t6c9t9rk99cd80ypxqz",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: fee_collector",
    address: "wolo17xpfvakm2amg962yls6f84z3kell8c5lczx6zq",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: gov",
    address: "wolo10d07y265gmmuvt4z0w9aw880jnsr700jjekllw",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: interchainaccounts",
    address: "wolo1vlthgax23ca9syk7xgaz347xmf4nunef0nnd9d",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: mint",
    address: "wolo1m3h30wlvsf8llruxtpukdvsy0km2kum8q2zzwa",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: nft",
    address: "wolo1hr93qzcjspaa32px0qqywlh9hf9a8plg8rrvw6",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: not_bonded_tokens_pool",
    address: "wolo1tygms3xhhs3yv487phx3dw4a95jn7t7lfqsyx7",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
  {
    label: "Module: transfer",
    address: "wolo1yl6hdjhmkf37639730gffanpzndzdpmhxynn77",
    use: "MODULE_DO_NOT_USE",
    role: "module",
  },
] as const satisfies readonly WoloMainnetNetworkAccount[];

export function isWoloNetworkModuleAccount(account: WoloMainnetNetworkAccount) {
  return account.role === "module" || account.use.startsWith("MODULE_");
}

export function isWoloNetworkRetiredAccount(account: WoloMainnetNetworkAccount) {
  return account.use === "RETIRED_DO_NOT_USE";
}

export function isWoloNetworkUserFacingAccount(account: WoloMainnetNetworkAccount) {
  return (
    account.use === "PUBLIC_RECEIVE_OK" ||
    account.use === "BOUNTIES_PUBLIC_OK" ||
    account.use === "BET_DEPOSIT_ADDRESS_IF_MANUAL" ||
    account.use === "USER"
  );
}
