import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { boardMarkup } from '../board-view.mjs';
import { fighter } from './fixtures.mjs';

test('fighter board markers show segmented HP for 2, 3 and 4 HP and five V2 Engagement pips',()=>{
  const state=createGame({},'fighter-status','v2-continuous');
  state.fighters=[
    fighter('two',{hp:1,maxHp:2}),
    fighter('three',{hp:2,maxHp:3,quadrant:'Aft'}),
    fighter('four',{hp:4,maxHp:4,quadrant:'Port'}),
  ];
  state.fighters[0].engagementRemaining=5;
  state.fighters[1].engagementRemaining=3;
  state.fighters[2].engagementRemaining=1;
  const markup=boardMarkup(state);
  for(const [id,hp,max] of [['two',1,2],['three',2,3],['four',4,4]]) {
    const start=markup.indexOf(`data-fighter="${id}"`),next=markup.indexOf('data-fighter="',start+1);
    const marker=start<0?'':markup.slice(start,next<0?markup.length:next);
    assert.equal((marker.match(/fighter-status-segment hp /g)||[]).length,max,`${max} HP segments render`);
    assert.equal((marker.match(/fighter-status-segment hp filled/g)||[]).length,hp,`${hp} HP segments are filled`);
    assert.equal((marker.match(/fighter-status-segment engagement /g)||[]).length,5,'five Engagement segments render');
  }
  assert.match(markup,/HP 1\/2 Engagement 5\/5/);
});

test('V1 fighter markers show HP and omit the inactive Engagement concept',()=>{
  const state=createGame({},'fighter-status-v1','v1');
  state.fighters=[fighter('classic',{hp:1,maxHp:3})];
  const marker=boardMarkup(state).match(/<g class="fighter-marker[\s\S]*?<\/g>/)?.[0];
  assert.match(marker,/HP 1\/3/);
  assert.doesNotMatch(marker,/fighter-engagement-ring|Engagement/);
});
