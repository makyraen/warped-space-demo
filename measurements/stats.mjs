export function median(values) {
    if (!values.length) throw new Error('Empty median input');
    const s=[...values].sort((a,b)=>a-b),n=s.length;
    return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;
}
// Hyndman-Fan type 7: position (n-1)*p, linearly interpolated.
export function quantile(values,p) {
    if(!values.length||p<0||p>1)throw new Error('Invalid quantile input');
    const s=[...values].sort((a,b)=>a-b),x=(s.length-1)*p,k=Math.floor(x);
    return s[k]+(s[Math.min(k+1,s.length-1)]-s[k])*(x-k);
}
