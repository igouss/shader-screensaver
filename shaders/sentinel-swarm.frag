// Sentinel Swarm — a squid-like hunter machine swimming through the dark, segmented tentacles trailing, while the red eyes of the swarm drift behind it (twigl geekest)
// Theme: The Matrix
vec2 p=(FC.xy*2.-r)/r.y,q,id;float T=mod(t,1e3),l,a,h,w,d,s,k,L;vec3 c=vec3(.012,.026,.036)*(1.5-length(p)*.6);
for(float j=0.;j<3.;j++){q=p*(3.5+j*2.5)+vec2(T*(.05+j*.025),sin(T*.07+j)*.6+j*7.);id=floor(q);h=fract(sin(dot(id,vec2(127.1,311.7)))*43758.5);q=fract(q)-.5-vec2(h-.5,fract(h*13.)-.5)*.5;q.x=abs(q.x)-.03/(1.+j);if(h>.8)c+=vec3(1.,.08,.04)*.00005*(3.-j)/(dot(q,q)+.00015)*(.6+.4*sin(T*.6+h*50.));}
p-=vec2(.25+sin(T*.13)*.15,.12+cos(T*.11)*.08);p*=rotate2D(.5+.35*sin(T*.05));l=length(p);a=atan(p.y,p.x);
for(float i=0.;i<17.;i++){h=fract(sin(i*91.7)*437.5);w=i<12.?3.1416+(i/11.-.5)*2.2:i*1.2566;L=i<12.?1.4+h*.9:.42+h*.1;w+=(.3*sin(l*2.4-T*.8+i*1.7)+.12*sin(l*5.5-T*1.1+i*3.))*l*(i<12.?1.:.5);d=abs(mod(a-w+3.1416,6.2832)-3.1416)*l;s=(i<12.?.05:.03)*exp(-l*.9)*smoothstep(L,L*.7,l)*step(.12,l);k=clamp(1.-d/max(s,1e-4),0.,1.);c=max(c,vec3(.32,.4,.48)*sqrt(k)*(.55+.45*smoothstep(-.3,.3,sin(l*62.)))*(.35+.65*exp(-l*1.3))+vec3(1.,.1,.05)*k*.25*exp(-l*4.));}
d=l-.16;c=mix(c,vec3(.02,.025,.03)+vec3(.2,.25,.3)*smoothstep(-.03,0.,d)*smoothstep(-.3,.6,dot(normalize(p+1e-5),vec2(.6,.8))),smoothstep(.006,0.,d));
for(float e=0.;e<7.;e++){q=p-vec2(.07,0.)-vec2(.045+.035*mod(e,2.),0.)*rotate2D(e*.9-2.7);c+=vec3(1.,.1,.04)*.00005/(dot(q,q)+.00006)*(.8+.2*sin(T*.8+e));}
c+=vec3(.5,.05,.02)*.012/(dot(p-vec2(.07,0),p-vec2(.07,0))+.03);o.rgb=tanh(c*1.7)*(1.-.12*dot(p,p));
