// Acid Tunnel — rings of a resonant TB-303 sawtooth, each at a different filter cutoff, drift out of an acid-green tunnel (twigl geekest)
// Theme: techno
vec2 u=(FC.xy-.5*r)/r.y;float px=1./r.y;
float R=length(u),a=atan(u.y,u.x)+t*.05;
float z=.55/(R+.015)+mod(t*.15,16.);
float dz=.55/((R+.015)*(R+.015));
float x=fract(a*5./6.2831853);   // five waveform cycles around the tunnel
vec3 c=vec3(.012,.004,.02)*(1.+2.5*exp(-R*4.));
for(float k=-1.;k<2.;k++){
  float id=floor(z)+k;
  float cut=.5+.5*sin(id*.7854+t*.09);          // filter cutoff of this ring
  float res=.35+.55*(.5+.5*sin(id*1.5708+1.));  // resonance of this ring
  float om=18.+44.*cut,de=4.+8.*(1.-cut),amp=mix(.4,.75,cut);
  float w=0.,dw=0.;
  for(float e=0.;e<2.;e++){
    float xx=x+e*.002;
    float saw=smoothstep(0.,.05,xx)*2.*(1.-xx)-1.;
    float ww=amp*saw+res*exp(-xx*de)*sin(xx*om);
    if(e<.5)w=ww;else dw=(ww-w)/.002;
  }
  float v=z-id-.5-.2*w;
  // distance to the curve in screen units from the analytic gradient
  float gr=length(vec2(dz,.2*dw*.7958/max(R,.02)));
  float ds=abs(v)/gr;
  float line=1.-smoothstep(.8*px,2.2*px,ds);
  float glow=exp(-ds/.009);
  vec3 lc=mix(vec3(.72,1.,.12),vec3(1.,.22,.58),clamp(exp(-x*5.)*res*1.3,0.,1.));
  float fade=smoothstep(.04,.26,R)*(1.-smoothstep(.9,1.25,R))*(.45+.55*cut);
  c+=lc*(line*.9+glow*.3)*fade;
}
c*=1.-.25*dot(u,u);
o.rgb=1.-exp(-c*1.9);
