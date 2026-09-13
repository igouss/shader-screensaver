// Rain Pond — raindrop rings spread and interfere on a still night pond, breaking up the moon's reflection (twigl geekest)
// Theme: waves
vec2 p=(FC.xy-.5*r)/r.y, q=p, g=vec2(0);
float h0=.25, dep=0., rip=0.;
if(p.y<h0){
  // ground-plane coordinates on the water, then sum ring waves from recurring drops
  dep=.3/(h0-p.y);
  vec2 w=vec2(p.x*dep,dep);
  for(float i=0.;i<38.;i++){
    float T=1.8+2.6*fract(sin(i*7.13)*91.7);
    float ph=mod(t,7200.)/T+fract(sin(i*3.7)*43.1);
    float n=mod(floor(ph),97.);ph=fract(ph);
    vec2 d0=fract(sin(vec2(n*1.31+i*7.7,n*2.17+i*3.3))*vec2(4375.5,2931.7));
    float z=.4+d0.y*2.4;
    vec2 dv=w-vec2((d0.x-.5)*2.*z*r.x/r.y,z);
    float d=length(dv), x=d-ph*.9;
    float env=exp(-x*x*45.)*smoothstep(0.,-.02,x-.02)*(1.-ph)*(1.-ph)*smoothstep(0.,.08,ph);
    g+=cos(x*120.-1.)*env*dv/max(d,.001);
    rip+=env;
  }
  g*=.4/(1.+dep*dep*.4);
  // mirror across the horizon and bend the reflection by the ripple slopes
  q=vec2(p.x,2.*h0-p.y)+g*vec2(.15,.9)/max(dep,.6);
}
// sky: indigo gradient, haze on the horizon, moon glow from above the frame
vec3 c=mix(vec3(.09,.11,.17),vec3(.015,.02,.045),smoothstep(h0,.6,q.y));
vec2 m=vec2(.22,.58);
float md=length(q-m);
c+=vec3(.5,.55,.62)*(.3*exp(-md*4.)+smoothstep(.045,.03,md)*(p.y<h0?.35:1.2));
// far shore: two rows of spruce spires
for(float k=0.;k<2.;k++){
  float x=q.x*(10.-3.*k)+k*5.3, id=floor(x), f=fract(x)-.5;
  float hh=fract(sin(id*12.9+k*3.)*437.5);
  float ht=h0+.012+.02*sin(q.x*3.+k)+(1.-abs(f)*2.)*(.035+.06*hh)*(1.-.3*k);
  ht+=.004*sin(q.y*300.)*abs(f);
  c=mix(c,vec3(.006,.009,.014)+k*vec3(.012,.016,.024),smoothstep(.002,-.002,q.y-ht));
}
if(p.y<h0){
  float fr=.3+.55*pow(clamp(1.-(h0-p.y)*1.5,0.,1.),2.);
  c=c*fr+vec3(.005,.009,.014);
  // ring crests catch the moonlight all over the pond
  c+=vec3(.3,.38,.5)*(max(0.,-g.y)+.4*abs(g.x))*.9*smoothstep(-.6,.2,p.y);
  // broken glitter column under the moon
  float col_=exp(-abs(p.x-m.x-g.x*.05)*14.)*smoothstep(-.5,h0,p.y);
  c+=vec3(.55,.6,.68)*col_*(.06+.5*max(0.,g.y+.3*g.x)*smoothstep(.2,.6,fract(sin(dot(floor(vec2(p.x*60.,dep*40.)),vec2(12.9,78.2)))*437.5)));
  // thin mist over the water near the shore
  c+=vec3(.03,.04,.05)*exp(-(h0-p.y)*14.);
}
c*=1.-.4*pow(length(p*vec2(.75,1.)),2.);
o=vec4(1.-exp(-c*1.7),1.);
