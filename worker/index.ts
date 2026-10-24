// 所有请求先检查服务地区，分析入口与后台由 Worker 处理。
// Workers 把模块的每个具名导出当作入口，解析逻辑放在 events.ts，这里只保留默认导出。
import {EVENT_PATH, handleEvent, type EdgeRequest,type Env} from './events.ts';
import {behaviorRequest,expireBehavior,type BehaviorEnv} from './behavior.ts';
import {regionResponse} from './region.ts';
import type {RegionEnv} from './region-store.ts';
import {REGION_CRON, updateRegionData} from './region-update.ts';

export default {
  async fetch(request: EdgeRequest, env: Env&BehaviorEnv&RegionEnv) {
    const restricted = await regionResponse(request, env.ASSETS, env.REGION_DATA);
    if (restricted) return restricted;
    return await behaviorRequest(request,env) ?? (new URL(request.url).pathname === EVENT_PATH ? handleEvent(request, env) : env.ASSETS.fetch(request));
  },
  async scheduled(controller:{cron?:string; scheduledTime?:number},env:BehaviorEnv&RegionEnv){
    if(controller.cron===REGION_CRON){if(!env.REGION_DATA)throw Error('地区数据库存储未配置');await updateRegionData(env.REGION_DATA,controller.scheduledTime);}
    else await expireBehavior(env);
  },
};
