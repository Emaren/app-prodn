package satchel

// Fixture-only, one-chain Cosmos SDK accounting rehearsal. This is not a
// source of real bank receipts, an independently certified reviewer, nor a
// production signer. Only disposable keys/accounts are used.
import (
    "bytes"
    "math/rand"
    "testing"
    "time"

    "cosmossdk.io/log"
    sdkmath "cosmossdk.io/math"
    abci "github.com/cometbft/cometbft/abci/types"
    cmtproto "github.com/cometbft/cometbft/proto/tendermint/types"
    dbm "github.com/cosmos/cosmos-db"
    "github.com/cosmos/cosmos-sdk/baseapp"
    "github.com/cosmos/cosmos-sdk/client/flags"
    "github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
    simtestutil "github.com/cosmos/cosmos-sdk/testutil/sims"
    sdk "github.com/cosmos/cosmos-sdk/types"
    authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
    banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
    "github.com/emaren/wolochain/app"
    "github.com/spf13/viper"
    "github.com/stretchr/testify/require"
    cmtjson "github.com/cometbft/cometbft/libs/json"
)

// The exact 100 WOLO remains a customer liability even when escrow sends
// back an unmatched 12 WOLO. The vault must cover its OWN two 1-uwolo fees.
// Escrow similarly needs independent gas for returning the full principal.
// A successful funded branch and a refused underfunded branch are exercised.
func TestSatchelV1ContinuousIsolatedSDKFeeConservation(t *testing.T) {
    t.Run("independently_prefunded_vault_and_escrow_gas", func(t *testing.T) {
        rehearseContinuousSatchelSDK(t, 2, true)
    })
    t.Run("underfunded_vault_cannot_pay_out_full_principal", func(t *testing.T) {
        rehearseContinuousSatchelSDK(t, 1, false)
    })
}

func rehearseContinuousSatchelSDK(t *testing.T, vaultGas int64, withdrawalMustSucceed bool) {
    t.Helper()
    const deposit int64 = 100_000_000
    const stake int64 = 12_000_000
    const fee int64 = 1

    opts := viper.New()
    opts.Set(flags.FlagHome, t.TempDir())
    application := app.New(log.NewNopLogger(), dbm.NewMemDB(), nil, true, opts, baseapp.SetChainID(ChainID))
    t.Cleanup(func() { require.NoError(t, application.Close()) })

    ownerKey := secp256k1.GenPrivKeyFromSecret([]byte("fixture-only-satchel-owner-not-live-keys"))
    vaultKey := secp256k1.GenPrivKeyFromSecret([]byte("fixture-only-satchel-vault-not-live-keys"))
    escrowKey := secp256k1.GenPrivKeyFromSecret([]byte("fixture-only-satchel-escrow-not-live-keys"))
    owner := sdk.AccAddress(ownerKey.PubKey().Address())
    vault := sdk.AccAddress(vaultKey.PubKey().Address())
    escrow := sdk.AccAddress(escrowKey.PubKey().Address())
    require.False(t, bytes.Equal(owner, vault))
    require.False(t, bytes.Equal(vault, escrow))

    vals, err := simtestutil.CreateRandomValidatorSet()
    require.NoError(t, err)
    genesis, err := simtestutil.GenesisStateWithValSet(
        application.AppCodec(), application.DefaultGenesis(), vals,
        []authtypes.GenesisAccount{
            authtypes.NewBaseAccount(owner, ownerKey.PubKey(), 0, 0),
            authtypes.NewBaseAccount(vault, vaultKey.PubKey(), 1, 0),
            authtypes.NewBaseAccount(escrow, escrowKey.PubKey(), 2, 0),
        },
        banktypes.Balance{Address: owner.String(), Coins: sdk.NewCoins(sdk.NewCoin(Denom, sdkmath.NewInt(deposit + 3_000_000)))},
        banktypes.Balance{Address: vault.String(), Coins: sdk.NewCoins(sdk.NewCoin(Denom, sdkmath.NewInt(vaultGas)))},
        banktypes.Balance{Address: escrow.String(), Coins: sdk.NewCoins(sdk.NewCoin(Denom, sdkmath.NewInt(fee)))},
    )
    require.NoError(t, err)
    state, err := cmtjson.Marshal(genesis)
    require.NoError(t, err)
    start := time.Now().UTC().Truncate(time.Second)
    _, err = application.InitChain(&abci.RequestInitChain{
        ChainId: ChainID, Time: start, AppStateBytes: state,
        ConsensusParams: simtestutil.DefaultConsensusParams,
    })
    require.NoError(t, err)

    getBalance := func(addr sdk.AccAddress, height int64) int64 {
        ctx := application.NewUncachedContext(false, cmtproto.Header{Height: height})
        return application.BankKeeper.GetBalance(ctx, addr, Denom).Amount.Int64()
    }
    send := func(height int64, key *secp256k1.PrivKey, from, to sdk.AccAddress, amount int64, account, sequence uint64) uint32 {
        t.Helper()
        signed, err := simtestutil.GenSignedMockTx(rand.New(rand.NewSource(height)),
            application.TxConfig(), []sdk.Msg{banktypes.NewMsgSend(from, to, sdk.NewCoins(sdk.NewInt64Coin(Denom, amount)))},
            sdk.NewCoins(sdk.NewInt64Coin(Denom, fee)), 200000, ChainID,
            []uint64{account}, []uint64{sequence}, key)
        require.NoError(t, err)
        encoded, err := application.TxConfig().TxEncoder()(signed)
        require.NoError(t, err)
        result, err := application.FinalizeBlock(&abci.RequestFinalizeBlock{
            Height: height, Time: start.Add(time.Duration(height) * time.Second),
            NextValidatorsHash: vals.Hash(), Txs: [][]byte{encoded},
        })
        require.NoError(t, err)
        require.Len(t, result.TxResults, 1)
        _, err = application.Commit()
        require.NoError(t, err)
        return result.TxResults[0].Code
    }

    require.Zero(t, send(1, ownerKey, owner, vault, deposit, 0, 0), "100 WOLO signed deposit")
    require.Equal(t, deposit + vaultGas, getBalance(vault, 1), "exact customer principal plus separate gas reserve")
    require.Zero(t, send(2, vaultKey, vault, escrow, stake, 1, 0), "12 WOLO signed escrow stake")
    require.Equal(t, deposit - stake + vaultGas - fee, getBalance(vault, 2))
    require.Zero(t, send(3, escrowKey, escrow, vault, stake, 2, 0), "full 12 WOLO unmatched escrow principal return")
    require.Equal(t, int64(0), getBalance(escrow, 3), "escrow's independent gas is exhausted")
    require.Equal(t, deposit + vaultGas - fee, getBalance(vault, 3),
        "no 2 percent fee: every uwolo of original principal still owed")

    receivedBefore := getBalance(owner, 3)
    outcome := send(4, vaultKey, vault, owner, deposit, 1, 1)
    if withdrawalMustSucceed {
        require.Zero(t, outcome, "prefunded gas must allow full 100 WOLO withdrawal")
        require.Equal(t, deposit, getBalance(owner, 4)-receivedBefore)
        require.Equal(t, int64(0), getBalance(vault, 4),
            "two 1-uwolo vault fees consume only the separate gas stipend")
    } else {
        require.NotZero(t, outcome, "custody may not claim solvency from an unfunded fee reserve")
        require.Equal(t, receivedBefore, getBalance(owner, 4),
            "insufficient gas must not become a partial payout")
        require.Less(t, getBalance(vault, 4), deposit,
            "a vault with original 100 WOLO but no gas cannot cover all liabilities")
    }
}
