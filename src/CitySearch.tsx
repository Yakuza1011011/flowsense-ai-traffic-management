import {useEffect,useRef,useState} from 'react';
import {Search,MapPin,Check,ChevronDown,X} from 'lucide-react';
import {cities,searchCities,type City} from '../shared/cities';

export default function CitySearch({city,onSelect}:{city:City;onSelect:(id:string)=>void}){
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const matches=searchCities(query);
 useEffect(()=>{const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',dismiss);return()=>document.removeEventListener('pointerdown',dismiss)},[]);
 useEffect(()=>{if(open)root.current?.querySelector(`#city-option-${active}`)?.scrollIntoView({block:'nearest'})},[active,open]);
 function choose(selected:City){setQuery('');setOpen(false);setActive(0);onSelect(selected.id);input.current?.focus()}
 return <div className="city-search" ref={root}>
  <label className="city-search-label" htmlFor="city-search-input">Your city</label>
  <div className={`city-search-field ${open?'is-open':''}`}><Search size={18}/>
   <input id="city-search-input" ref={input} role="combobox" aria-label="Search Karnataka cities" aria-autocomplete="list" aria-expanded={open} aria-controls="city-search-results" aria-activedescendant={open&&matches.length?`city-option-${active}`:undefined} autoComplete="off" placeholder={`Search cities · ${city.name}`} value={query}
    onFocus={()=>{setOpen(true);setActive(0)}} onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true)}}
    onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActive(i=>Math.min(matches.length-1,open?i+1:0))}else if(event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(i=>Math.max(0,i-1))}else if(event.key==='Enter'&&open&&matches[active]){event.preventDefault();choose(matches[active])}else if(event.key==='Escape'){event.preventDefault();setOpen(false);setQuery('')}else if(event.key==='Tab')setOpen(false)}}/>
   {query?<button className="icon-btn" aria-label="Clear city search" onClick={()=>{setQuery('');setActive(0);setOpen(true);input.current?.focus()}}><X size={16}/></button>:<button className="icon-btn" aria-label="Show all Karnataka cities" aria-expanded={open} onClick={()=>{input.current?.focus();setOpen(true);setActive(0)}}><ChevronDown size={16}/></button>}
  </div>
  {open&&<div className="city-search-dropdown"><div className="city-results-caption">KARNATAKA <span>{matches.length} {matches.length===1?'city':'cities'}</span></div><ul id="city-search-results" role="listbox" aria-label="Karnataka cities">{matches.map((item,index)=><li key={item.id} id={`city-option-${index}`} role="option" aria-selected={item.id===city.id} className={active===index?'is-active':''} onPointerMove={()=>setActive(index)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)}><span className="city-result-icon"><MapPin size={17}/></span><span><strong>{item.name}</strong><small>{item.aliases[0]} · {item.region}</small></span>{item.id===city.id&&<Check size={17}/>}</li>)}</ul>{!matches.length&&<div className="city-no-results" role="status"><Search size={24}/><strong>No matching city</strong><p>Try Mysuru, Hubli, Belgaum, or another supported city.</p></div>}<div className="city-search-hint">Use ↑ ↓ to browse and Enter to select · {cities.length} cities</div></div>}
 </div>
}
