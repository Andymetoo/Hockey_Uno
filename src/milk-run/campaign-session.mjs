/** A portable backup may include the one active sortie, never one full log per history record. */
import { importCampaignStore, discardCampaignSortie, CAMPAIGN_STORE_KEY } from './campaign.mjs';
import { loadSession, SAVE_KEY } from './persistence.mjs';

export function campaignBackup(store, session = null) {
  const checked = importCampaignStore(store);
  const assignment = session?.state.campaign;
  const campaign = checked.campaigns.find(c=>c.id===assignment?.campaignId);
  const activeSession = campaign?.activeSortie && assignment && campaign.activeSortie.sortieId===assignment.sortieId ? structuredClone(session) : null;
  return { kind: 'milk-run-campaign-backup', version: 1, store: checked, activeSession };
}

export function parseCampaignBackup(input) {
  const data = typeof input==='string'?JSON.parse(input):structuredClone(input);
  if(data.kind!=='milk-run-campaign-backup')return {store:importCampaignStore(data),activeSession:null};
  if(data.version!==1)throw new Error('Unsupported campaign backup version.');
  const store=importCampaignStore(data.store);
  let activeSession=null;
  if(data.activeSession){
    activeSession=loadSession({getItem:key=>key===SAVE_KEY?JSON.stringify(data.activeSession):null});
    if(!activeSession)throw new Error('The campaign backup contains an invalid active sortie.');
    const assignment=activeSession.state.campaign;
    const campaign=store.campaigns.find(c=>c.id===assignment?.campaignId);
    if(!assignment||JSON.stringify(campaign?.activeSortie)!==JSON.stringify(assignment))throw new Error('The active sortie does not match this campaign backup.');
    for(const snapshot of [activeSession.view,...activeSession.pending.map(event=>event.state)]){
      if(JSON.stringify(snapshot.campaign)!==JSON.stringify(assignment))throw new Error('A pending snapshot has a different campaign identity.');
    }
  }
  return {store,activeSession};
}

/** Validate before changing either independent storage record; roll back a failed pair. */
export function storeCampaignBackup(input, storage=globalThis.localStorage) {
  const backup=parseCampaignBackup(input);
  const changes=[[CAMPAIGN_STORE_KEY,JSON.stringify(backup.store)]];
  if(backup.activeSession)changes.push([SAVE_KEY,JSON.stringify(backup.activeSession)]);
  const previous=changes.map(([key])=>[key,storage.getItem(key)]);
  try{for(const [key,value] of changes)storage.setItem(key,value);}
  catch(error){
    for(const [key,value] of previous.reverse()){
      try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{/* Surface original write error. */}
    }
    throw error;
  }
  return backup;
}

/** DEV discard validates before writes and restores both keys if either write fails.
 * An orphan reservation is safe to release: the validated store still owns all
 * living identities. An unreadable/ambiguous autosave fails closed instead.
 */
export function discardActiveCampaignSession(store, campaignId, sortieId, confirmed = false, storage = globalThis.localStorage) {
  const result = discardCampaignSortie(store, campaignId, sortieId, confirmed);
  if (!result.discarded) return result;
  const previousStore = storage.getItem(CAMPAIGN_STORE_KEY), previousSave = storage.getItem(SAVE_KEY);
  if (previousStore !== null && JSON.stringify(importCampaignStore(previousStore)) !== JSON.stringify(store))
    throw new Error('Campaign history changed in storage. Reload before discarding.');
  let removeSave = false;
  if (previousSave !== null) {
    let saved;
    try { saved = JSON.parse(previousSave); } catch { throw new Error('Cannot safely identify the active autosave. Discard cancelled.'); }
    if (!saved?.state || !saved.view || !Array.isArray(saved.pending)) throw new Error('Cannot safely identify the active autosave. Discard cancelled.');
    const snapshots = [saved.state, saved.view, ...saved.pending.map(event => event.state)];
    const belongs = snapshot => snapshot?.campaign?.campaignId === campaignId && snapshot.campaign.sortieId === sortieId;
    if (snapshots.some(snapshot => snapshot?.campaign?.campaignId === campaignId || snapshot?.campaign?.sortieId === sortieId)) {
      const assignment = store.campaigns.find(c => c.id === campaignId).activeSortie;
      const matches = snapshot => belongs(snapshot) && ['aircraftId', 'sortieNumber', 'startedAt'].every(key => snapshot.campaign[key] === assignment[key]) &&
        Object.entries(assignment.crewIds).every(([role, id]) => snapshot.campaign.crewIds?.[role] === id);
      if (!snapshots.every(matches)) throw new Error('Autosave identity does not match the active reservation. Discard cancelled.');
      if (saved.state.outcome || saved.state.phase === 'ended') throw new Error('An ended sortie cannot be discarded; finish its Campaign finalization.');
      removeSave = true;
    }
  }
  try {
    storage.setItem(CAMPAIGN_STORE_KEY, JSON.stringify(result.store));
    if (removeSave) storage.removeItem(SAVE_KEY);
  } catch (error) {
    for (const [key, value] of [[CAMPAIGN_STORE_KEY, previousStore], [SAVE_KEY, previousSave]]) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* Surface original storage error. */ }
    }
    throw error;
  }
  return { ...result, removedAutosave: removeSave };
}
