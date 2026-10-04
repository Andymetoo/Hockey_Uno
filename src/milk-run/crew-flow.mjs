// Interaction states are derived from the presentation queue, never saved as rules.
export const compactCrewFlow = s => s.ruleset === 'v2-continuous' && s.config.v2CompactCrewFlow === true;
export function crewFlowState(queue, interaction, choice) {
  if (!compactCrewFlow(queue.view)) return 'legacy';
  if (queue.busy) return queue.current?.type === 'CREW_ACTIVATED' ? 'activating' : 'resolving';
  if (queue.view.phase === 'story') return 'story';
  if (interaction) return 'targeting';
  if (queue.view.phase === 'action') return choice ? 'choosing' : 'ready';
  return 'selection';
}
export const compactCost = cost => (cost || 'FREE').replace(/\s*Enlisted/g,'E').replace(/\s*Officer/g,'O');
export const STATION_PALETTE = ['relocate','manCockpit','manStation','leaveStation'];
export function actionPalette(actions) {
  const stations = actions.filter(a=>STATION_PALETTE.includes(a.id));
  return [...actions.filter(a=>!STATION_PALETTE.includes(a.id)), ...(stations.length?[{id:'stations',label:'Station',enabled:stations.some(a=>a.enabled),reason:stations.map(a=>`${a.label}: ${a.reason||'Available'}`).join(' ')}]:[])];
}
// Screen-space hit regions also cover close targets, independent of SVG scale.
export function nearbyTargets(rects, id, x, y, radius=24) {
  const hit=rects.find(r=>r.id===id);
  if(!hit)return [id];
  const px=Number.isFinite(x)&&x!==0?x:hit.x+hit.width/2, py=Number.isFinite(y)&&y!==0?y:hit.y+hit.height/2;
  return rects.filter(r=>r.id===id || px>=r.x-radius&&px<=r.x+r.width+radius&&py>=r.y-radius&&py<=r.y+r.height+radius).map(r=>r.id);
}
