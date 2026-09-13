// Mast Signal — a lattice radio mast at dusk sends amplitude-modulated wavefronts rolling across the sky (twigl geekest)
// Theme: radio
vec2 u=(FC.xy-.5*r)/r.y;float px=1./r.y;
// sky: plum horizon fading to night
vec3 c=mix(vec3(.13,.07,.12),vec3(.004,.008,.025),smoothstep(-.32,.45,u.y));
c+=vec3(.08,.05,.03)*exp(-abs(u.y+.3)*9.);
// stars
vec2 g=u*170.;vec2 gi=floor(g);float h=fract(sin(dot(gi,vec2(12.9898,78.233)))*43758.5453);
c+=vec3(.8,.85,1.)*step(.993,h)*smoothstep(-.1,.4,u.y)*(.5+.3*sin(t*.5+h*60.))*max(0.,1.-length(fract(g)-.5)*2.6)*.8;
// wavefronts from the mast top: carrier rings under a travelling AM envelope
vec2 P=vec2(0.,.16);float d=length(u-P);
float ph=d*30.-mod(t*1.2,43.982297);
float car=pow(.5+.5*cos(ph),8.);
float env=.5+.5*sin(ph/7.);env*=env;
float fall=exp(-d*1.5)*smoothstep(.0,.06,d);
c+=vec3(1.,.8,.42)*(car*env*.55+env*.05)*fall;
// guy wires
for(float k=0.;k<4.;k++){vec2 A=vec2(0.,k<2.?.07:-.1);vec2 B=vec2((mod(k,2.)*2.-1.)*(k<2.?.58:.34),-.29);vec2 e=B-A;vec2 w=u-A;float s=clamp(dot(w,e)/dot(e,e),0.,1.);c*=mix(1.,.25,1.-smoothstep(.0,1.2*px,length(w-e*s)-.0004));}
// mast: tapering lattice with cross bracing
float my=(.16-u.y)/.46;float mw=.004+.032*my;float sx=u.x/mw;
float v=my*13.;
float br=min(abs(fract(v+sx*.5)-.5),abs(fract(v-sx*.5)-.5));
float rung=abs(fract(v)-.5);
float lat=max(smoothstep(.72,.86,abs(sx)),max(1.-smoothstep(.465,.49,br),1.-smoothstep(.47,.49,rung)));
float inM=(1.-smoothstep(mw-px,mw+px,abs(u.x)))*step(0.,my)*step(my,1.1);
c=mix(c,vec3(.006,.004,.008),inM*lat);
// ground
float yg=-.3+.018*sin(u.x*4.+1.)+.01*sin(u.x*11.);
c=mix(c,vec3(.008,.006,.01)+vec3(.02,.012,.01)*exp(-abs(u.y-yg)*30.),1.-smoothstep(yg-px,yg+px,u.y));
// red aviation beacons, breathing slowly
float b=pow(.5+.5*sin(t*1.9),3.);
vec2 q1=u-P;vec2 q2=vec2(abs(u.x)-.019,u.y+.07);
c+=vec3(1.,.12,.05)*(b*.00028+.00003)/(dot(q1,q1)+.00035);
c+=vec3(1.,.12,.05)*(pow(.5+.5*sin(t*1.9-1.2),3.)*.00012+.00002)/(dot(q2,q2)+.00025);
c*=1.-.3*dot(u,u);
o.rgb=1.-exp(-c*1.5);
