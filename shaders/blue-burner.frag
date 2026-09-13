// Blue Burner — a gas ring's crown of blue flame tongues purring around a dark burner cap in a night kitchen (twigl geekest)
// Theme: flame
vec2 p=(FC.xy-.5*r)/r.y, C=vec2(0,-.1);
float R=.3, T=mod(t,6283.), sq=.36+.08*sin(T*.07), orb=T*.06, hh=.035, gas=1.+.12*sin(T*.45)+.06*sin(T*.83+1.);
vec2 e=p-C; e.y/=sq;
float el=length(e);
// dark enamel stove top, with blue light pooled around the ring
vec3 c=vec3(.012,.013,.02)*(1.-.3*p.y);
c+=vec3(.03,.06,.16)*exp(-abs(el-R)*5.)*.9*gas;
c+=vec3(.01,.02,.05)*exp(-el*1.5);
for(float k=0.;k<2.;k++){
  if(k>0.){
    // burner cap: a raised dark puck whose rim catches the flame light
    vec2 ct=vec2(e.x,e.y-hh/sq);
    float top=length(ct)-(R-.035);
    float side=max(abs(e.x)-(R-.035),max(-e.y,e.y-hh/sq));
    float cap=min(top,side);
    vec3 capc=vec3(.012,.014,.022)+vec3(.06,.12,.35)*smoothstep(-.05,0.,top)*.6*step(top,side)
             +vec3(.02,.04,.1)*step(side,top)*(.5+.5*e.x/R);
    c=mix(c,capc,smoothstep(.006,-.006,cap*sq));
  }
  for(float i=0.;i<28.;i++){
    float a=mod((i+.5)/28.*6.2831+orb,6.2831);
    float fr=-sin(a);
    if((k<.5)==(fr>0.))continue;          // first pass: jets behind the cap, second: in front
    vec2 b=C+vec2(cos(a),sin(a)*sq)*R+vec2(0,hh*.6);
    float s=.1*(1.+.2*fr)*gas;
    float fl=1.+.16*sin(T*1.9+i*2.3)+.1*sin(T*2.9+i*5.1)+.06*sin(T*.7+i);
    vec2 q=(p-b)/s; q.y/=fl;
    q.x-=cos(a)*.45*q.y+.12*sin(T*1.3+i*3.)*q.y*q.y;   // lean outward, lick sideways
    float y=q.y, w=.26*pow(max(1.-y,0.),.8)*sqrt(max(y+.04,0.));
    float body=exp(-q.x*q.x/(w*w+1e-4))*step(-.04,y)*smoothstep(1.,.55,y);
    float yi=y/.42, wi=.5*.26*pow(max(1.-yi,0.),.8)*sqrt(max(yi+.04,0.));
    float cone=exp(-q.x*q.x/(wi*wi+1e-4))*step(0.,yi)*smoothstep(1.,.4,yi);
    // rare warm tip where the flame burns a little rich
    float tip=smoothstep(.6,1.,y)*body*step(.93,fract(sin(i*91.7)*437.))*(.5+.5*sin(T*.4+i));
    c+=vec3(.1,.22,.95)*body*.35+vec3(.35,.75,1.)*cone*.55+vec3(.9,.45,.15)*tip*.4;
    vec2 d=p-b-vec2(0,s*.35);
    c+=vec3(.05,.12,.5)*.0012/(dot(d,d)+.003);
  }
}
c*=1.-.45*pow(length(p*vec2(.75,1.)),2.);
o=vec4(1.-exp(-c*1.5),1.);
