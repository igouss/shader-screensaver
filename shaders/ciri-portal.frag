// Ciri Portal — an Elder Blood gateway: a tilted ring of emerald-white fire with a spiral vortex turning inside it, seen as volumetric light (twigl geekest)
// Theme: The Witcher
vec2 u=(FC.xy*2.-r)/r.y;vec3 d=normalize(vec3(u,1.6)),p,c;float g=.5,e,T=mod(t,62.832);
for(float i=0.;i<80.;i++){
p=d*g;p.z-=3.3;
p.yz*=rotate2D(.4);p.xz*=rotate2D(.3*sin(T*.1));
float a=length(p.xy),an=atan(p.y,p.x),s=sin(an*3.-log(a+.02)*6.+T*.5+sin(p.z*4.+T*.3));
float w=sin(an*7.+T*.4-a*3.)*sin(an*4.-T*.3);
float tor=length(vec2(a-1.2,p.z))-.045-.02*s;
float disk=max(abs(p.z)-.03,a-1.15);
e=min(tor,max(disk,.015));
c+=tor<disk?mix(vec3(.2,.9,.6),vec3(.9,1.,.95),.5+.5*s)*.004/(.004+tor*tor):mix(vec3(.02,.35,.3),vec3(.6,1.,.85),.5+.5*s)*(.35+.65*(.5+.5*s))*.004/(.004+disk*disk)*smoothstep(1.25,.1,a);
c+=vec3(.1,.6,.45)*.0035*max(w,0.)/(.012+pow(max(tor,0.)-.12,2.));
g+=max(e*.7,.03);if(g>9.)break;}
c+=vec3(.02,.06,.05)*exp(-length(u)*1.2);
o=vec4(1.-exp(-c*.3*(1.-.15*dot(u,u))),1.);
