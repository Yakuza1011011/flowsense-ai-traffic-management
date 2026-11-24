import artifact from './model.json';
import {features,congestion,type Observation,type Road,type Settings} from '../shared/traffic';
type Tree={left:number[];right:number[];feature:number[];threshold:number[];value:number[]};
type Model={trees:Tree[];selected:string};
export const modelInfo=artifact as unknown as {version:string;models:Record<string,Model>;metrics:any[];features:any[];split?:any;city_metrics?:Record<string,any[]>;road_ids?:string[]};
export function forecast(history:Observation[],road:Road,horizon:number,settings:Settings){
 const last=history.at(-1)!;const m=modelInfo.models[String(horizon)];let speed=last.average_speed_kmh;let model='Persistence baseline';
 // The learned model expects consecutive 15-minute observations; otherwise use persistence.
 const valid=history.length>=4&&history.slice(-4).every((o,i,a)=>o.interval_minutes===15&&(i===0||Date.parse(o.timestamp)-Date.parse(a[i-1].timestamp)===900000));
 if(m?.selected==='forest'&&valid&&(modelInfo.road_ids?.includes(road.id)??road.cityId==='bengaluru')){const x=features(history,road);speed=m.trees.reduce((sum,t)=>{let n=0;while(t.left[n]!==-1)n=x[t.feature[n]]<=t.threshold[n]?t.left[n]:t.right[n];return sum+t.value[n];},0)/m.trees.length;model='Random forest';}
 speed=+Math.min(road.limit,Math.max(1,speed)).toFixed(1);
 return {road_segment_id:road.id,horizon,speed,status:congestion(speed,road.limit,settings),timestamp:new Date(Date.parse(last.timestamp)+horizon*60000).toISOString(),issued_at:last.timestamp,model,model_version:model==='Random forest'?modelInfo.version:'persistence-v1'};
}
