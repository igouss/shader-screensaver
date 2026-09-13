// Meat Grinder — creeping down the dry tunnel, rusted ribs slipping past towards the light around its bend (twigl geekest)
// Theme: Stalker
float T=mod(t,3000.),z=.1,e=1.,i,R,k,w,Z=T*.25,L;vec2 u=(FC.xy*2.-r)/r.y;vec3 d=normalize(vec3(u,1.4)),p,c,h=vec3(0);
d.xy*=rotate2D(.04*sin(T*.21));
for(i=0.;i<80.;i++){
  p=d*z;p.z+=Z;
  p.xy+=vec2(sin(Z*.13)*1.5,cos(Z*.09)*.6)-vec2(sin(p.z*.13)*1.5,cos(p.z*.09)*.6);
  R=length(p.xy);k=fract(p.z*1.2)-.5;
  w=p.y+.95;
  e=min(min(1.25-R,length(vec2(R-1.25,k/1.2))-.075),w);
  h+=vec3(1.,.85,.6)*.0035*exp(-abs(Z+17.-p.z)*.2)*(.6+.4*sin(p.z*3.+p.x*2.-T*.4));
  if(e<.002||z>40.)break;
  z+=e*.75;
}
L=exp(-max(Z+17.-p.z,0.)*.22);
w=atan(p.y,p.x);R=sin(p.z*2.1+sin(w*4.)*2.)*sin(w*6.+p.z*1.3+sin(p.z*.7)*3.)+.5*sin(w*17.+sin(p.z*5.)*2.)*sin(p.z*9.+w*3.);
vec3 m=mix(vec3(.12,.12,.1),vec3(.34,.16,.07),smoothstep(-.6,.9,R));w=p.y+.95;
m=mix(m,vec3(.45,.24,.1),smoothstep(.12,.0,abs(k))*step(.01,w));
if(w<.01){k=sin(p.z*7.54+.06*sin(p.x*9.+T*.7));m=mix(vec3(.05,.06,.05),vec3(.26,.14,.07),.5+.5*k)+vec3(.8,.7,.5)*(L+.2)*smoothstep(.9,.0,abs(p.x+.04*sin(p.z*2.+T*.5)))*(.6+.4*k)*.5;}
c=m*(.03+1.1*L+.9/(1.+z*z*.08))*(1.-i/120.);
c=mix(c,vec3(.5,.45,.35)*L,1.-exp(-z*.03))+h;
c=mix(c,dot(c,vec3(.3,.55,.15))*vec3(.9,1.,.8),.35);
c*=1.-.3*dot(u*.6,u*.6);
o.rgb=tanh(c*1.3);
