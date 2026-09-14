vec3 d=.5-FC.rgb/r.y,p=vec3(0,0,5);d.x+=r.x/r.y*.5-.5;o+=.1;
if(25.-25.*d.z*d.z/dot(d,d)<17.3){
float e=1.,b=0.,D,R,S,C,u;
for(int k=1;k<16;k++){u=fsnoise(p.xy+float(k)*1.37);
for(int j=0;j<18;j++){u=fract(u+.618034);R=u*2.-1.;R=b+R*R*R*PI;S=sin(R);C=cos(R);D=length(p-vec3(S+4.*S*C,C-2.*(C*C-S*S),S*(4.*S*S-3.)))-sin(R*36.+t*9.)*.1-1.;if(D<e){e=D;b=R;}}
o+=.1/exp(e*1e3);p-=d*e++;
if(o.r>=1.||p.z<-2.2)break;}}
