// 仅移动控件所在的横向容器，避免 scrollIntoView 连带移动整页。
export function revealHorizontal(container:HTMLElement,target:HTMLElement,instant=false){
  const area=container.getBoundingClientRect(),item=target.getBoundingClientRect(),inset=14;
  const shift=item.left<area.left+inset?item.left-area.left-inset:item.right>area.right-inset?item.right-area.right+inset:0;
  if(shift)container.scrollTo({left:container.scrollLeft+shift,behavior:instant||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
