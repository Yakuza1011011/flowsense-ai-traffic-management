const configuredOrigin=(import.meta.env.VITE_API_ORIGIN||'').replace(/\/$/,'');
export function apiUrl(path:string){return `${configuredOrigin}/api${path}`}
export async function request(path:string,method='GET',body?:unknown){
 const response=await fetch(apiUrl(path),{method,credentials:configuredOrigin?'omit':'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok)throw Object.assign(new Error(data.error||'Request failed.'),{status:response.status});
 return data;
}
export async function downloadCsv(query:URLSearchParams){
 const response=await fetch(apiUrl(`/export?${query}`),{credentials:configuredOrigin?'omit':'same-origin'});
 if(!response.ok){const error=await response.json();throw new Error(error.error||'Export failed.')}
 const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=`flowsense-${query.get('city')}-${query.get('type')}.csv`;link.click();URL.revokeObjectURL(url);
}
