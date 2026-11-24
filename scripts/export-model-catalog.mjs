import {writeFileSync} from 'node:fs';
import {roads} from '../shared/traffic.ts';
import {getCity} from '../shared/cities.ts';
writeFileSync('ml/roads.json',JSON.stringify(roads.map(road=>({id:road.id,cityId:road.cityId,limit:road.limit,trafficScale:getCity(road.cityId).trafficScale,rushOffset:getCity(road.cityId).rushOffset})),null,2)+'\n');
console.log(`Exported ${roads.length} roads for model training.`);
