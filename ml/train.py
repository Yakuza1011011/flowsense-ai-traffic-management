"""Deterministic synthetic benchmark. Never a claim of real-world accuracy."""
import json, math
from datetime import datetime, timedelta, timezone
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROADS=json.loads((Path(__file__).parent/'roads.json').read_text())
NAMES=['time_sin','time_cos','weekday','road_index','speed_now','speed_lag_1','speed_lag_2','speed_mean_4','vehicle_count','occupancy']
def make_data(days=28):
    start=datetime(2026,9,1,tzinfo=timezone.utc)
    timestamps=[start+timedelta(minutes=15*i) for i in range(days*96)]
    X=[]; targets={h:[] for h in [15,30,60]}; times=[]
    for i,road in enumerate(ROADS):
        limit=road['limit']
        values=[]
        for t in timestamps:
            local=t+timedelta(minutes=330); hour=local.hour+local.minute/60-road['rushOffset']
            rush=math.exp(-((hour-9)/1.8)**2)*.5+math.exp(-((hour-18)/2.2)**2)*.72
            load=min(.93,.13+(i%4)*.07+rush*road['trafficScale']+math.sin(t.timestamp()/1800+i*1.7)*.07)
            values.append((round(max(5,limit*(1-load*.85)),1),round(70+load*280),round(load*100,1)))
        for j in range(3,len(values)-4):
            t=timestamps[j];local=t+timedelta(minutes=330);hour=local.hour+local.minute/60
            speed,count,occ=values[j]
            X.append([math.sin(hour/24*2*math.pi),math.cos(hour/24*2*math.pi),local.weekday(),i,speed,values[j-1][0],values[j-2][0],np.mean([v[0] for v in values[j-3:j+1]]),count,occ]);times.append(t.timestamp())
            for h in targets:targets[h].append(values[j+h//15][0])
    order=np.argsort(times,kind='stable')
    return np.array(X)[order],{h:np.array(y)[order] for h,y in targets.items()},np.array(times)[order]

def split_masks(times):
    unique=np.unique(times);v=unique[int(len(unique)*.7)];test=unique[int(len(unique)*.85)]
    return times+3600<v,(times>=v)&(times+3600<test),times>=test

def train():
    X,targets,times=make_data();train_mask,val_mask,test_mask=split_masks(times)
    result={'version':'synthetic-karnataka-rf-v2','dataset':'28 days of synthetic traffic across 11 Karnataka cities; demonstration only','road_ids':[r['id'] for r in ROADS],'city_metrics':{r['cityId']:[] for r in ROADS},'features':NAMES,'models':{},'metrics':[], 'split':{'method':'Chronological 70/15/15, purged 60-minute target gap','train_end':datetime.fromtimestamp(max(times[train_mask]),timezone.utc).isoformat(),'validation_start':datetime.fromtimestamp(min(times[val_mask]),timezone.utc).isoformat(),'validation_end':datetime.fromtimestamp(max(times[val_mask]),timezone.utc).isoformat(),'test_start':datetime.fromtimestamp(min(times[test_mask]),timezone.utc).isoformat()}}
    for h,y in targets.items():
        model=RandomForestRegressor(n_estimators=16,max_depth=8,min_samples_leaf=8,random_state=42,n_jobs=-1)
        model.fit(X[train_mask],y[train_mask]);val=model.predict(X[val_mask]);selected='forest' if mean_absolute_error(y[val_mask],val)<mean_absolute_error(y[val_mask],X[val_mask,4]) else 'baseline'
        pred=model.predict(X[test_mask]);base=X[test_mask,4]
        result['metrics'].append({'horizon':h,'mae':round(mean_absolute_error(y[test_mask],pred),3),'rmse':round(math.sqrt(mean_squared_error(y[test_mask],pred)),3),'baseline_mae':round(mean_absolute_error(y[test_mask],base),3),'baseline_rmse':round(math.sqrt(mean_squared_error(y[test_mask],base)),3),'selected':selected,'test_samples':int(test_mask.sum()),'importance':dict(zip(NAMES,[round(float(v),4) for v in model.feature_importances_]))})
        for city_id in result['city_metrics']:
            road_indices=[i for i,r in enumerate(ROADS) if r['cityId']==city_id]
            mask=np.isin(X[test_mask,3],road_indices)
            result['city_metrics'][city_id].append({**result['metrics'][-1],
                'mae':round(mean_absolute_error(y[test_mask][mask],pred[mask]),3),
                'rmse':round(math.sqrt(mean_squared_error(y[test_mask][mask],pred[mask])),3),
                'baseline_mae':round(mean_absolute_error(y[test_mask][mask],base[mask]),3),
                'baseline_rmse':round(math.sqrt(mean_squared_error(y[test_mask][mask],base[mask])),3),
                'test_samples':int(mask.sum())})
        trees=[]
        for est in model.estimators_:
            tree=est.tree_;trees.append({'left':tree.children_left.tolist(),'right':tree.children_right.tolist(),'feature':tree.feature.tolist(),'threshold':tree.threshold.tolist(),'value':tree.value.reshape(-1).tolist()})
        result['models'][str(h)]={'selected':selected,'trees':trees}
    out=Path(__file__).resolve().parents[1]/'server/model.json';out.write_text(json.dumps(result,separators=(',',':')))
    print(json.dumps({'version':result['version'],'metrics':result['metrics'],'bytes':out.stat().st_size},indent=2))
if __name__=='__main__':train()
