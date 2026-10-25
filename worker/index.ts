// 动态接口保留地区检查，静态资源由边缘地区规则与 Assets 提供。
// Workers 把模块的每个具名导出当作入口，解析逻辑放在 events.ts，这里只保留默认导出。
import {EVENT_PATH, handleEvent, type EdgeRequest,type Env} from './events.ts';
import {behaviorRequest,expireBehavior,type BehaviorEnv} from './behavior.ts';
import {regionResponse} from './region.ts';

export default {
  async fetch(request: EdgeRequest, env: Env&BehaviorEnv) {
    const restricted = await regionResponse(request, env.ASSETS);
    if (restricted) return restricted;
    return await behaviorRequest(request,env) ?? (new URL(request.url).pathname === EVENT_PATH ? handleEvent(request, env) : env.ASSETS.fetch(request));
  },
  async scheduled(_controller:{cron?:string; scheduledTime?:number},env:BehaviorEnv){
    await expireBehavior(env);
  },
};
