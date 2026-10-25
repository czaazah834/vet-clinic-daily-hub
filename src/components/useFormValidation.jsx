import { useId, useState } from 'react';

// Field errors are derived from current values on every render, including changes
// to related fields. Untouched empty fields stay quiet until submit or blur.
export function useFormValidation(errors) {
  const prefix = useId();
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [inputErrors,setInputErrors] = useState({});
  const allErrors={...errors};
  for(const [key,error] of Object.entries(inputErrors)) if(error)allErrors[key]=error;
  const touch = key => setTouched(previous => ({...previous,[key]:true}));
  const show = key => (submitted || touched[key]) ? allErrors[key] || '' : '';
  const field = key => ({name:key, id:`${prefix}-${key}`, 'aria-invalid':!!show(key), 'aria-describedby':`${prefix}-${key}-error`, onBlur:()=>touch(key)});
  const feedback = key => <span id={`${prefix}-${key}-error`} className="err field-feedback" aria-live="polite">{show(key)}</span>;
  const edited = event => {
    const control=event.target;
    if(control.name) {
      touch(control.name);
      setInputErrors(previous=>({...previous,[control.name]:control.validity?.badInput ? 'Enter a valid number.' : ''}));
    }
  };
  const formProps = {noValidate:true,onChangeCapture:edited};
  const validate = event => {
    setSubmitted(true);
    const first = Array.from(event.currentTarget.elements).find(control => (allErrors[control.name] || control.validity?.badInput) && !control.disabled);
    if(first?.validity?.badInput) setInputErrors(previous=>({...previous,[first.name]:'Enter a valid number.'}));
    if (first) first.focus();
    return !first && !Object.values(allErrors).some(Boolean);
  };
  return {field,feedback,formProps,validate};
}
