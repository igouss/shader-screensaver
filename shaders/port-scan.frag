// Port Scan — a phosphor-green radar sweep across a scattered network of hosts, each pinging as the beam passes while open ports glow amber (twigl geekest)
// Theme: hacking
vec2 p=(FC.xy*2.-r)/r.y,q,id,c;float R=.9,l=length(p),a=atan(p.y,p.x),A=fract(t/14.)*6.2832,g,h,e,s,d,k,b,n;vec3 C=vec3(.004,.01,.006);
e=smoothstep(R+.004,R-.004,l);g=mod(A-a,6.2832);b=exp(-g*1.1)*e;C+=vec3(.02,.07,.035)*e*(1.-l*.5)+vec3(.05,.9,.3)*(b*.2+exp(-g*50.)*.45*e);
q=abs(fract(p*5.)-.5);C+=vec3(.06,.45,.2)*e*(smoothstep(.02,0.,min(q.x,q.y))*.07+smoothstep(.012,0.,abs(fract(l*4.444+.5)-.5))*.12)*(1.+b*3.);
n=abs(fract(a/6.2832*72.+.5)-.5);C+=vec3(.1,.7,.3)*(smoothstep(.006,0.,abs(l-R))*.5+smoothstep(.004,0.,min(abs(p.x),abs(p.y)))*e*.07+smoothstep(.06,0.,n)*step(R,l)*step(l,R+(fract(a/6.2832*8.+.0625)<.125?.05:.025))*.3);
for(float j=0.;j<9.;j++){id=floor(p*3.5)+vec2(mod(j,3.),floor(j/3.))-1.;h=fract(sin(dot(id,vec2(127.1,311.7)))*43758.5);k=fract(h*57.3);c=(id+.5+(vec2(h,k)-.5)*.7)/3.5;
if(length(c)>R-.05||h<.15)continue;d=length(p-c);s=mod(A-atan(c.y,c.x),6.2832)/.4488;
e=fract(h*917.)>.78?1.:0.;q=vec2(exp(-s*.35),exp(-s*.7));
C+=vec3(.2,1.,.45)*(.00025/(d*d+.00025)*(.3+q.x*1.4)+smoothstep(.005,0.,abs(d-s*.045))*q.y*.8*step(s,5.)+smoothstep(.004,0.,abs(d-s*.045+.03))*q.y*.3*step(.03,s*.045)*step(s,5.));
C+=vec3(1.,.55,.08)*e*(.0003/(d*d+.0001)*(.4+.2*sin(t*.5+h*40.)+q.x)*.6+smoothstep(.003,0.,abs(max(abs(p-c).x,abs(p-c).y)-.032))*(.3+q.x*.7));}
C+=vec3(.1,.8,.3)*.0006/(l*l+.0006);o.rgb=tanh(C*1.4)*(1.-.15*dot(p,p));
