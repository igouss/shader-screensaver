mat3 R=rotate3D(t*.3,vec3(1))*.31622777;vec3 B=vec3((FC.xy-.5*r)/r.x*(5.-sin(t*.3)*2.),.3)*R,C=vec3(0,0,1)*R;
for(float i,g,e,s;++i<11.;){vec3 p=B+g*C;s=1.;for(int i;i++<45;p=vec3(0,.98030607,.94868330)-abs(abs(p)*e-vec3(.63245553,.88543774,.96449470)))s*=e=max(1.,1./dot(p,p));g-=mod(length(p.yx+p.zy),p.y)/s*1.8973666;o.rgb+=hsv(.6,g*i-1.2649111*p.x,s/4e3);}
