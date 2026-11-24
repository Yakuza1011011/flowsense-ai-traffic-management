import data from './cities.json';
export type City={id:string;name:string;aliases:string[];region:string;center:[number,number];anchors?:[number,number][];zoom:number;trafficScale:number;rushOffset:number};
export const cities=data as City[];
export const defaultCity=cities[0];
export const getCity=(id:string)=>cities.find(city=>city.id===id);
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[\s–—_-]+/g,' ').trim();
export function searchCities(query:string){const term=normalize(query);return cities.filter(city=>[city.name,city.id,...city.aliases].some(value=>normalize(value).includes(term)))}
