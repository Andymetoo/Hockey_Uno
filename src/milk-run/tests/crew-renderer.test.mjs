import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../state.mjs';
import { STATIONS, getCell } from '../board.mjs';
import { crewMarkerLayout, boardMarkup } from '../board-view.mjs';
import { footprintCenter } from '../ui-model.mjs';

const epsilon=1e-8;
function assertContained(marker) {
  const {left,top,right,bottom}=marker.bounds;
  // Outer radius includes the widest selected/targeted token stroke.
  assert.ok(marker.x-marker.outerRadius>=left-epsilon, `${marker.id} left bound`);
  assert.ok(marker.x+marker.outerRadius<=right+epsilon, `${marker.id} right bound`);
  assert.ok(marker.y-marker.outerRadius>=top-epsilon, `${marker.id} top bound`);
  assert.ok(marker.y+marker.outerRadius<=bottom+epsilon, `${marker.id} bottom bound`);
  if(marker.badge) {
    const {x,y,radius}=marker.badge;
    assert.ok(x-radius-.5>=left-epsilon&&x+radius+.5<=right+epsilon, `${marker.id} status badge horizontal bounds`);
    assert.ok(y-radius-.5>=top-epsilon&&y+radius+.5<=bottom+epsilon, `${marker.id} status badge vertical bounds`);
  }
}

test('normal crew retain one centered marker across their full authoritative footprints',()=>{
  const state=createGame(),before=structuredClone(state),layout=crewMarkerLayout(state);
  assert.equal(layout.length,10);
  for(const marker of layout) {
    const center=footprintCenter(STATIONS[marker.id].cells);
    assert.equal(marker.x,89+center.x*36,marker.id);
    assert.equal(marker.y,87+center.y*36,marker.id);
    assertContained(marker);
  }
  const html=boardMarkup(state);
  assert.equal((html.match(/data-crew-id=/g)||[]).length,10);
  assert.equal((html.match(/class="crew-body"/g)||[]).length,10);
  assert.deepEqual(state,before,'rendering does not alter positions, job state or RNG');
});

test('Engineer working at D3-1 stays inside D3-1 beside Radio instead of offsetting onto the wing',()=>{
  const state=createGame(),engineer=state.crew.find(crew=>crew.id==='engineer');
  engineer.position=['D3-1'];engineer.job='repair';
  state.jobs=[{id:'repair',kind:'repair',crewId:'engineer',cells:['E3-1'],workPosition:['D3-1'],completeRound:3}];
  const before=structuredClone(state),layout=crewMarkerLayout(state),marker=layout.find(item=>item.id==='engineer');
  const square=getCell('D3-1');
  assert.deepEqual(marker.bounds,{left:89+square.x*36,top:87+square.y*36,right:89+(square.x+1)*36,bottom:87+(square.y+1)*36});
  assertContained(marker);
  const radio=layout.find(item=>item.id==='radio'),center=footprintCenter(STATIONS.radio.cells);
  assert.equal(radio.x,89+center.x*36,'Radio keeps the centered straddling marker');
  assert.equal(radio.y,87+center.y*36);
  assert.match(boardMarkup(state),/data-crew-id="engineer" data-footprint="D3-1"/);
  assert.deepEqual(state,before);
});

test('two through ten workers in one quarter fan inside that exact location with individual markers',()=>{
  for(let count=2;count<=10;count++) {
    const state=createGame();
    const workers=state.crew.slice(0,count);
    for(const crew of workers){crew.position=['D3-1'];crew.job=`work-${crew.id}`;}
    state.jobs=workers.map(crew=>({id:crew.job,kind:'repair',crewId:crew.id,cells:[],workPosition:['D3-1'],completeRound:3}));
    const before=structuredClone(state),layout=crewMarkerLayout(state);
    const packed=layout.filter(marker=>workers.some(crew=>crew.id===marker.id));
    assert.equal(new Set(packed.map(marker=>`${marker.x},${marker.y}`)).size,count,`${count} distinct visible centers`);
    for(const marker of layout)assertContained(marker);
    assert.equal((boardMarkup(state).match(/data-crew-id=/g)||[]).length,10);
    assert.deepEqual(state,before);
  }
});

test('shared single-seat workspace keeps the seated crew centered and contains each work token and badge',()=>{
  const state=createGame(),pilot=state.crew.find(crew=>crew.id==='pilot');
  for(const id of ['engineer','radio','ball']) {
    const worker=state.crew.find(crew=>crew.id===id);worker.position=[...pilot.position];worker.job=`work-${id}`;
  }
  const layout=crewMarkerLayout(state),center=footprintCenter(pilot.position),marker=layout.find(item=>item.id==='pilot');
  assert.equal(marker.x,89+center.x*36);
  assert.equal(marker.y,87+center.y*36);
  for(const item of layout)assertContained(item);
  assert.equal(new Set(layout.filter(item=>['pilot','engineer','radio','ball'].includes(item.id)).map(item=>`${item.x},${item.y}`)).size,4);
});

test('a cockpit replacement and its dead former occupant retain distinct contained tokens',()=>{
  const state=createGame(),pilot=state.crew.find(crew=>crew.id==='pilot'),engineer=state.crew.find(crew=>crew.id==='engineer');
  pilot.health='dead';engineer.station='pilot';engineer.position=[...pilot.position];
  const layout=crewMarkerLayout(state),replacement=layout.find(marker=>marker.id==='engineer'),casualty=layout.find(marker=>marker.id==='pilot');
  assert.equal(replacement.x,replacement.anchor.x);
  assert.equal(replacement.y,replacement.anchor.y);
  assert.notDeepEqual([replacement.x,replacement.y],[casualty.x,casualty.y]);
  for(const marker of layout)assertContained(marker);
});
