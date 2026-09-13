// Vegas Haze — walking between the legs of colossal statues in the orange irradiated dust of 2049 Las Vegas (twigl geekest)
// Theme: Blade Runner
float T=mod(t,1500.),z=.1,e=1.,i,h,k,w,y;vec2 u=(FC.xy*2.-r)/r.y,g;vec3 d=normalize(vec3(u,1.9)),p,q,v,s=normalize(vec3(-.4,.3,1.)),a=vec3(0);
d.yz*=rotate2D(.12);d.xz*=rotate2D(.1*sin(T*.04));
for(i=0.;i<90.;i++){
  p=d*z;p.z+=T*.75+9.;p.y+=.2;
  e=p.y+1.4-.35*sin(p.x*.21+sin(p.z*.13)*2.)*cos(p.z*.09);
  q=p;k=floor((q.z+22.)/44.);q.z=mod(q.z+22.,44.)-22.;q.x+=1.2*sin(k*2.3);
  q.xy*=rotate2D(.06*sin(k*1.7));
  w=abs(q.x)-2.7+.16*q.y;
  h=max(length(vec2(w,q.z))-.28-.045*max(q.y+1.4,0.),abs(q.y-3.5)-5.);
  h=min(h,(length((q-vec3(0,9.6,0))*vec3(.45,.5,.75))-1.)*1.5);
  h=min(h,(length((q-vec3(0,12.4,0))*vec3(.5,.45,.9))-1.)*1.6);
  h=min(h,length((q-vec3(-.5,15.6,.4))*vec3(1.,.85,1.))-1.2);
  v=q-vec3(1.6,13.,0);y=clamp(dot(v,vec3(-.35,1,.1))/1.135,0.,4.2);h=min(h,length(v-vec3(-.35,1,.1)*y)-.42);
  v=q-vec3(-1.7,13.,0);y=clamp(dot(v,vec3(-.25,-1,.15))/1.085,0.,4.);h=min(h,length(v-vec3(-.25,-1,.15)*y)-.4);
  e=min(e,h);
  a+=vec3(.9,.45,.15)*.004*(.5+.5*sin(p.x*.7-T*1.3+sin(p.y*1.3+p.z*.35-T*.3)*2.5))*exp(-z*.02);
  if(e<.002*z||z>80.)break;
  z+=e*.85;
}
float f=1.-exp(-z*.06),b=max(dot(d,s),0.);
f=mix(f,1.,smoothstep(4.,18.,p.y)*.55);
vec3 fog=mix(vec3(.5,.21,.05),vec3(.17,.06,.02),smoothstep(-.3,.9,u.y))+vec3(1.,.55,.2)*(.25*pow(b,8.)+.6*pow(b,90.));
vec3 c=vec3(.04,.018,.008)*(1.+i*.01);
c=mix(c,fog,f)+a*.5;
for(float j=0.;j<3.;j++){g=u*(5.+j*4.)+vec2(T*(1.+j*.5),j*7.);g.y+=.4*sin(g.x*.35+j);vec2 id=floor(g);g=fract(g)-.5;
  c+=vec3(1.,.62,.3)*.12*smoothstep(.08,0.,length(g*vec2(.35,1.)))*step(.88,fract(sin(dot(id,vec2(12.9898,78.233)))*43758.5));}
c*=1.-.25*dot(u*.6,u*.6);
o.rgb=tanh(c*1.25);
