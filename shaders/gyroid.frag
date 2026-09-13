// twigl "geekest": drifting through the glowing shells of a twisted gyroid
vec3 p,d=normalize(vec3((FC.xy*2.-r)/r.y,1.5));float z=0.,e=1.;for(float i=0.;i<70.;i++){p=d*z;p.z+=t*.5;p.xy*=rotate2D(p.z*.15+t*.05);e=abs(dot(sin(p*2.),cos(p.yzx*2.)))*.3+.01;z+=e*.8;o.rgb+=(1.2+cos(p.z*.4+t*.2+vec3(0,2,4)))*.00035/e*exp(-z*.2);}o.rgb=tanh(o.rgb);
