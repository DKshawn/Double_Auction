import { rng, shuffle } from './engine.mjs';
import { createProtocol } from './protocols.mjs';
export function classroomProtocol(studyId, seed, randomizeChoices) {
  const protocol=createProtocol(studyId,seed,{randomizeChoices:false});
  protocol.version+='/teacher-1';
  protocol.trials=protocol.trials.filter(trial=>!['familiarity','historical-knowledge'].includes(trial.id));
  const random=rng(seed^0x7341a5c9);
  for(const trial of protocol.trials) for(const field of trial.fields) {
    if(field.type==='choice'&&field.optionOrder!=='fixed'&&randomizeChoices)field.options=shuffle(field.options,random);
  }
  protocol.presentation={randomizeChoices,optionOrders:protocol.trials.map(trial=>({trialId:trial.id,
    fields:trial.fields.filter(field=>field.options).map(field=>({fieldId:field.id,values:field.options.map(option=>option.value)}))}))};
  return protocol;
}

