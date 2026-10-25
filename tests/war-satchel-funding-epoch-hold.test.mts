import assert from 'node:assert/strict';
import test from 'node:test';
import {requireDurableProspectiveDepositEpoch} from '../lib/warSatchelDurableEpoch.ts';

test('an approved-looking store cannot bypass the independent source epoch HOLD',async()=>{
 let reads=0;
 const tx={$queryRaw:async()=>{reads++;throw Error('DATABASE_REACHED_BEFORE_EPOCH_HOLD');}};
 await assert.rejects(requireDurableProspectiveDepositEpoch(tx as never,{} as never),/live_financial_epoch_hold/);
 assert.equal(reads,0,'an unauthorized epoch cannot acquire credibility from DB claims');
});
