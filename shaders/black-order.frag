// Black Order — the grey rises: black smoke tendrils climbing through pale fog and swallowing a cold shaft of light from above (twigl geekest)
// Theme: Hard to Be a God
vec2 p=(FC.xy*2.-r)/r.y,q=p*vec2(1.9,.75);float T=mod(t,628.3),n=0.,a=.5;
for(int i=0;i<6;i++){q+=vec2(sin(q.y*1.7+T*.2+float(i)),cos(q.x*1.3-T*.17))*.42;n+=a*sin(q.x*1.3+q.y*.9+T*.05)*cos(q.y*.7-T*.2);q=q*rotate2D(.9)*1.8;a*=.5;}
float L=-.35+.28*sin(T*.07)+.12*sin(T*.03+1.);
float ray=pow(max(1.-abs(p.x*.7-p.y*.15+.1*n),0.),4.)*(.55+.45*sin(atan(p.x,1.5-p.y)*37.+n*2.));
float fog=.16+.1*n+.18*ray*smoothstep(-1.,1.2,p.y);
float b=p.y-L-.45*n-.12*sin(p.x*2.7+T*.1)+.08*abs(p.x)-.035*sin(q.x*.35+q.y*.2);
float ink=smoothstep(.0,.12,b);
float rim=exp(-abs(b)*18.)*.12;
vec3 c=mix(vec3(.006+.03*(n*.5+.5))*exp(min(b,0.)*2.5),vec3(.8,.88,1.)*fog+rim,ink)+rim*(1.-ink)*.4;
c*=1.-.3*dot(p,p)*.25;
o=vec4(1.-exp(-c*1.6),1.);
