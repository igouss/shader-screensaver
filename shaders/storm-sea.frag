#define WAVES(P) W=0.;A=.0656680;b=1.25;for(int j=0;j<26;j++){P.xz*=R;x=(++P.x+P.z)*b+t+t;w=exp(sin(x))*A;P.xz-=w*cos(x);W+=w;A*=.8;b*=1.25;}
vec2 u=(FC.xy-.5*r)/r.y;mat2 R=rotate2D(5.),Q=rotate2D(.6);
float k=u.y*.8253356-.5646425,g=(1.6939275-.9)/-k,e=1.,D=-k,W,A,b,w,x,gl=g,el=1.,gh=-1.,eh=0.,gp=0.,ep=0.;vec3 p;int n,s=0;
for(n=0;n<11;n++){p=vec3(u*g,g-3.);p.zy*=Q;WAVES(p) e=p.y-W;
 if(abs(e)<5e-6)break;
 if(e>0.){if(s==1&&gh>0.)eh*=.5;gl=g;el=e;s=1;}else{if(s==-1)el*=.5;gh=g;eh=e;s=-1;}
 if(gh>0.){D=(el-eh)/(gh-gl);g=gl+el/D;}
 else{if(n>0&&g!=gp)D=max((ep-e)/(g-gp),-k);gp=g;ep=e;g+=1.*e/max(D,-k);}}
float np=clamp(log(.3/g)/log(clamp(1.-abs(D),.01,.99)),1.,99.);
float cs=W*(99.-np)+.415*np;
p=vec3(u*g,g-3.);p.zy*=Q;p+=1e-4;WAVES(p) e=p.y-W;cs+=W;g+=e;
o.gb+=cs/4e2;o+=min(e*e*4e6,1./g)+g*g/2e2;
