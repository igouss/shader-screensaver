// twigl "geekest (300 es)" body: FC=gl_FragCoord, r=resolution, t=time, o=output color
float i=0.,g=0.,e=0.,R=0.;vec3 p;for(;++i<99.;){p=vec3((FC.xy*2.-r)/r.y*2.,g-2.)*rotate3D(t*.5+1.,vec3(0,1,0));R=.9;for(int j=0;j++<12;)p.xy-=min(p.x+p.y,0.),p.xz-=min(p.x+p.z,0.),p.yz-=min(p.y+p.z,0.),p=p*2.-1.,R*=2.;g+=e=.5*length(p)/R-5e-4;if(e<.0005)break;}o+=exp(-i*.04)*2.;
