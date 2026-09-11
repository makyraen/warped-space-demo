from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parent.parent
(ROOT/'figure').mkdir(exist_ok=True)
DATA=ROOT/'measurements/results'
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'savefig.dpi':220})
energy=json.loads((DATA/'energy_drift.json').read_text(encoding='utf-8'))
fig,ax=plt.subplots(figsize=(8,4),layout='constrained')
for key,label,color,style in [('eulerFixed','Euler, fixed','#bb514b','-'),('leapfrogFixed','KDK, fixed','#167a9b','-'),('eulerJitter','Euler, jitter','#bb514b','--'),('leapfrogJitter','KDK, jitter','#167a9b','--')]:
    s=energy[key]['series'];ax.semilogy([v['t'] for v in s],[max(v['rel'],1e-8) for v in s],label=label,color=color,ls=style,lw=1)
ax.set(xlabel='Simulation time',ylabel='Absolute relative energy error',ylim=(1e-8,2e-2))
ax.grid(alpha=.2,which='both');ax.legend(ncol=2,fontsize=8)
fig.savefig(ROOT/'figure/fig4_energy_drift.png');fig.savefig(ROOT/'figure/fig4_energy_drift.svg');plt.close(fig)

orbit=json.loads((DATA/'orbit-plot-data.json').read_text(encoding='utf-8'))
fig,ax=plt.subplots(figsize=(6,6),layout='constrained')
for radius in [100,200,300]:
    ax.add_patch(plt.Circle((0,0),radius,fill=False,color='#ccd2d9',lw=.7));ax.text(radius/np.sqrt(2),radius/np.sqrt(2),str(radius),fontsize=8,color='#77818b')
for c in orbit['curves']:
    s=np.asarray(c['samples']);x=s[:,0]*np.cos(s[:,1]);y=s[:,0]*np.sin(s[:,1]);gr=c['includeGR']
    ax.plot(x,y,color='#167a9b' if gr else '#b65243',ls='-' if gr else '--',lw=1.3,label='GR term included (4 periods)' if gr else 'GR term excluded (1 period)')
ax.scatter([0],[0],s=45,color='#253748',zorder=5)
ax.set(aspect='equal',xlabel='x',ylabel='y');ax.grid(alpha=.1);ax.legend(fontsize=8,loc='upper left')
fig.savefig(ROOT/'figure/fig5_orbit_gr_vs_newton.png');fig.savefig(ROOT/'figure/fig5_orbit_gr_vs_newton.svg');plt.close(fig)

perf=json.loads((DATA/'performance-current.json').read_text(encoding='utf-8'))
fig,axes=plt.subplots(1,2,figsize=(9.8,3.9),layout='constrained')
for model,color in [('RUBBER','#b65243'),('FLAMM','#167a9b')]:
    rows=sorted([r for r in perf['rows'] if r['model']==model],key=lambda r:r['count'])
    x=np.array([r['count'] for r in rows])
    mean=np.array([r['medianOfRoundMeansMs'] for r in rows])
    lo=np.array([r['minimumRoundMeanMs'] for r in rows]);hi=np.array([r['maximumRoundMeanMs'] for r in rows])
    axes[0].errorbar(x,mean,yerr=[mean-lo,hi-mean],fmt='o-',capsize=4,color=color,label=model)
    axes[1].plot(x,[r['pooledP95FrameMs'] for r in rows],'o-',color=color,label=model)
axes[0].set(xlabel='Number of masses',ylabel='Callback interval (ms)',title='(a) Median of round means; range')
axes[1].set(xlabel='Number of masses',ylabel='Callback interval (ms)',title='(b) Pooled 95th percentile')
axes[1].axhline(1000/60,color='#555555',ls='--',lw=1,label='60 Hz interval')
for ax in axes:ax.set_xticks([1,3,5]);ax.grid(alpha=.2);ax.legend(fontsize=8)
fig.savefig(ROOT/'figure/fig6_performance_current.png');fig.savefig(ROOT/'figure/fig6_performance_current.svg');plt.close(fig)
