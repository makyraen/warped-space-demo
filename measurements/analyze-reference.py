"""Independent Darwin-parameter reference; does not use the app radial acceleration."""
from pathlib import Path
import json, platform
import numpy as np
import scipy
from scipy.integrate import solve_ivp, quad
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import NullFormatter

ROOT=Path(__file__).resolve().parent.parent
data=json.loads((ROOT/'measurements/results/reference-trajectories.json').read_text(encoding='utf-8'))
summary=[]
examples={}
for case in data['cases']:
    M,p,e,L=(case[k] for k in ('M','p','e','L'))
    q=M/p
    times=np.asarray(case['sampleSteps'],dtype=float)*data['meta']['h0']
    # r(chi)=p/(1+e*cos(chi)); dphi/dchi and dtau/dchi follow
    # the exact turning-point parameterization, not the reduced radial ODE.
    scale=p**1.5/M**0.5*(1-(3+e*e)*q)**0.5
    def tau_prime(chi):
        c=np.cos(chi)
        return scale/((1+e*c)**2*np.sqrt(1-(6+2*e*c)*q))
    def rhs(t,y):
        chi=y[0]
        r=p/(1+e*np.cos(chi))
        return [1/tau_prime(chi),L/(r*r)]
    period=quad(tau_prime,0,2*np.pi,epsabs=1e-9,epsrel=5e-14)[0]
    exact_precession=quad(lambda chi:1/np.sqrt(1-(6+2*e*np.cos(chi))*q),0,2*np.pi,epsabs=1e-12,epsrel=5e-14)[0]-2*np.pi
    solutions=[]
    for tol,step_fraction in [(2e-12,1/160),(4e-14,1/320)]:
        sol=solve_ivp(rhs,(0,times[-1]),[0.,0.],method='DOP853',rtol=tol,atol=tol/10,max_step=period*step_fraction,t_eval=times)
        if not sol.success: raise RuntimeError(sol.message)
        r=p/(1+e*np.cos(sol.y[0]));phi=sol.y[1]
        xy=np.column_stack([r*np.cos(phi),r*np.sin(phi)])
        solutions.append((r,phi,xy))
    ref_r,ref_phi,ref_xy=solutions[1]
    ref_change=float(np.max(np.linalg.norm(solutions[0][2]-ref_xy,axis=1))/p)
    rows=[]
    for run in case['runs']:
        samples=np.asarray(run['samples'])
        r,phi=samples[:,0],samples[:,1]
        xy=np.column_stack([r*np.cos(phi),r*np.sin(phi)])
        errors=np.linalg.norm(xy-ref_xy,axis=1)/p
        row={k:run[k] for k in ('angleRule','divisor','h','maxEnergyRelative','minR','maxR')}
        row.update(maxPositionErrorOverP=float(np.max(errors)),rmsPositionErrorOverP=float(np.sqrt(np.mean(errors**2))),maxRadialErrorOverP=float(np.max(np.abs(r-ref_r))/p),maxAngleErrorRad=float(np.max(np.abs(phi-ref_phi))))
        rows.append(row)
        if case['id']=='M10-e0.6' and run['divisor']==1:
            examples[run['angleRule']]=(times/period,errors)
    orders={}
    for method in ('right-endpoint','trapezoid'):
        selected=[r for r in rows if r['angleRule']==method]
        orders[method]=float(np.polyfit(np.log([r['h'] for r in selected]),np.log([r['maxPositionErrorOverP'] for r in selected]),1)[0])
    summary.append({**{k:case[k] for k in ('id','M','p','e','rp','ra','L','E2')},'period':period,'exactPrecessionRad':exact_precession,'referenceRefinementMaxPositionOverP':ref_change,'sampleCount':len(times),'duration':float(times[-1]),'orders':orders,'runs':rows})
    print(case['id'], 'orders',orders,'reference refinement',ref_change)

result={'meta':{**data['meta'],'reference':'Darwin anomaly DOP853 in proper time, with independent quadrature for period and precession','python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__,'referenceTolerances':[2e-12,4e-14],'referenceMaxStepFractions':[1/160,1/320]},'cases':summary}
(ROOT/'measurements/results/reference-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'savefig.dpi':220})
fig,axes=plt.subplots(1,2,figsize=(10.4,4.0),layout='constrained')
colors={'right-endpoint':'#ba493f','trapezoid':'#167a9b'}
labels={'right-endpoint':'Previous angle update','trapezoid':'Trapezoidal angle update'}
for method in colors:
    for c in summary:
        rr=[r for r in c['runs'] if r['angleRule']==method]
        axes[0].loglog([r['h'] for r in rr],[r['maxPositionErrorOverP'] for r in rr],'-o',color=colors[method],alpha=.35,ms=3,lw=1)
    axes[0].plot([],[],color=colors[method],label=labels[method])
    x,y=examples[method]
    axes[1].semilogy(x[1:],np.maximum(y[1:],1e-16),color=colors[method],label=labels[method],lw=1.2)
axes[0].set(xlabel='Proper-time step',ylabel='Max. sampled position error / p',title='(a) Step refinement: all nine orbits')
axes[0].set_xticks([data['meta']['h0']/8,data['meta']['h0']/4,data['meta']['h0']/2,data['meta']['h0']], [r'$h_0/8$',r'$h_0/4$',r'$h_0/2$',r'$h_0$'])
axes[0].xaxis.set_minor_formatter(NullFormatter())
axes[1].set(xlabel='Proper time / radial period',ylabel='Position error / p',title='(b) M = 10, e = 0.6; default step')
for ax in axes: ax.grid(True,which='both',alpha=.18)
axes[0].legend(fontsize=8,loc='lower right')
fig.savefig(ROOT/'figure/fig7_reference_validation.png')
fig.savefig(ROOT/'figure/fig7_reference_validation.svg')
plt.close(fig)
