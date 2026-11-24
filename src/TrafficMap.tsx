import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {colors,type Road} from '../shared/traffic';
import {type City} from '../shared/cities';
export default function TrafficMap({city,roads,data,selected,onSelect,incidents=[]}:{city:City;roads:Road[];data:Record<string,any>;selected:string;onSelect:(id:string)=>void;incidents?:any[]}){
 const ref=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null);const [offline,setOffline]=useState(false);
 useEffect(()=>{if(!ref.current)return;map.current=L.map(ref.current,{zoomControl:false,scrollWheelZoom:false}).setView(city.center,city.zoom);L.control.zoom({position:'bottomright'}).addTo(map.current);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(map.current);tiles.on('tileerror',()=>setOffline(true));tiles.on('tileload',()=>setOffline(false));layer.current=L.layerGroup().addTo(map.current);const resize=new ResizeObserver(()=>map.current?.invalidateSize());resize.observe(ref.current);return()=>{resize.disconnect();map.current?.remove();map.current=null}},[]);
 useEffect(()=>{if(!layer.current||!map.current)return;layer.current.clearLayers();for(const road of roads){const d=data[road.id],color=colors[d?.status]||'#849897';const line=L.polyline(road.points,{color,weight:road.id===selected?9:6,opacity:.95,lineCap:'round'}).addTo(layer.current);line.bindTooltip(`${road.name} · ${d?.status||'No data'}${d?` · ${d.speed??d.average_speed_kmh} km/h`:''}`,{sticky:true});line.on('click',()=>onSelect(road.id));
 const point=road.points[Math.floor(road.points.length/2)];if(incidents.some(i=>i.road_segment_id===road.id&&i.status!=='Resolved'))L.marker(point,{icon:L.divIcon({className:'incident-pin',html:'!',iconSize:[24,24]})}).addTo(layer.current).bindTooltip(`Active incident · ${road.name}`).on('click',()=>onSelect(road.id));}
 },[roads,data,selected,incidents,onSelect]);
 useEffect(()=>{setOffline(false);if(roads.length)map.current?.fitBounds(L.latLngBounds(roads.flatMap(r=>r.points)).pad(.14),{maxZoom:city.zoom,animate:false});else map.current?.setView(city.center,city.zoom,{animate:false})},[city.id]);
 useEffect(()=>{const road=roads.find(r=>r.id===selected);if(road)map.current?.fitBounds(L.latLngBounds(road.points).pad(.7),{maxZoom:14,animate:false})},[selected]);
 return <div className="map-wrap"><div className="map-canvas" ref={ref} aria-label={`Interactive traffic map of ${city.name}`}/>{offline&&<div className="map-offline">Base map unavailable · traffic overlays remain available</div>}<div className="map-city-label">{city.name.toUpperCase()} <span>{city.center[0].toFixed(2)}° N · {city.center[1].toFixed(2)}° E</span></div><div className="map-legend">{Object.entries(colors).map(([name,color])=><span key={name}><i style={{background:color}}/>{name}</span>)}</div></div>
}
