import {useEffect} from 'react';
/** Keep keyboard focus within the active modal, then restore the trigger. */
export function useDialog(open:boolean,onClose:()=>void){
 useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;
 const key=(event:KeyboardEvent)=>{const dialog=document.querySelector<HTMLElement>('[role="dialog"]');if(!dialog)return;if(event.key==='Escape'){event.preventDefault();onClose();return}if(event.key!=='Tab')return;const elements=Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]'));const first=elements[0],last=elements.at(-1);if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last?.focus()}else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first?.focus()}};
 document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus()};
 },[open]);
}
