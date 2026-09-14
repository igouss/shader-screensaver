vec3 d=vec3((FC.xy-.5*r)/r.y,-.5);d.yz*=rotate2D(.7);
vec2 n0=vec2(1)*rotate2D(1.9);mat2 Q=rotate2D(1.);
float g=0.,e=7.,g0=0.,e0=0.,c=0.,Ec=7.,s=-1.,se=-1.,ph=0.,K=30.,ns=0.,dl=0.;
if(d.y<0.)for(int it=0;it<70;it++){
  K=ph<.5?clamp(ceil(log(e*.08)/-.2231),1.,30.):30.;
  vec3 p=d*g;if(ph>2.5)p-=.001;
  float h=p.y+7.,f=.4,a=.3310915;vec2 m=n0;
  for(float j=0.;j<30.;j++){if(j>=K)break;float x=dot(p.xz,m)*f+t+t,w=exp(sin(x))*a;p.xz-=m*w*cos(x);h-=w;f*=1.2;a*=.8;m*=Q;}
  if(ph<.5){
    c++;
    if(h<.15){ph=1.;continue;}
    if(c>=44.||(c>12.&&h*pow(max(h/e,0.),44.-c)>.3))break;
    e=h;g+=h;
  }else if(ph<1.5){
    Ec=h;g0=g;e0=h;g+=h;ph=2.;
  }else if(ph<2.5){
    s=(h-e0)/(g-g0);ns++;
    if(abs(h)<1e-6||ns>7.){ph=3.;continue;}
    g0=g;e0=h;g=(s<-1e-3&&s>-50.)?g-h/s:g+h;
  }else if(ph<3.5){
    dl=h;g+=1e-3;ph=4.;
  }else{
    float k=clamp(1.+(h-dl)/1e-3,-.999,.999),n=45.-c,r44=Ec*pow(abs(k),n)*(k<0.&&mod(n,2.)>.5?-1.:1.);
    o-=(dl+r44)*k*k*k*k*k*2e3;break;
  }
}
