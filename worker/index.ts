// 分析入口与后台走 Worker，公开页面与资源直接由静态资源返回。
// Workers 把模块的每个具名导出当作入口，解析逻辑放在 events.ts，这里只保留默认导出。
import {EVENT_PATH, handleEvent, type EdgeRequest,type Env} from './events.ts';
import {behaviorRequest,expireBehavior,type BehaviorEnv} from './behavior.ts';

export default {
  async fetch(request: EdgeRequest, env: Env&BehaviorEnv) {
    return await behaviorRequest(request,env) ?? (new URL(request.url).pathname === EVENT_PATH ? handleEvent(request, env) : env.ASSETS.fetch(request));
  },
  async scheduled(_controller:unknown,env:BehaviorEnv){await expireBehavior(env)},
};
