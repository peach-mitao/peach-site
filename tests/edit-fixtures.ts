import {post as handleEdit} from '../scripts/edit-server.ts';

// HTTP 响应的 JSON 边界在用例中断言；不让内部返回分支替代实际响应检查。
export async function post(...args:Parameters<typeof handleEdit>){
  const response=await handleEdit(...args);
  return {...response,json:response.json as Record<string,any>};
}
