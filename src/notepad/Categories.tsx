import { ChangeEvent, Dispatch, Fragment, MouseEvent, useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useNotepadStore from "./notepadStore";
import useConnectionStore from "../connectionStore";
import { NotepadCategoryFieldType, NotepadCategoryType, NotepadNewCategoryType } from "./idb/notepadStoreIdb";
import useWorkers from "../workers/workers";

function DisplayCategories() {

    let [editingCategoryId, setEditingCategoryId] = useState('');
    let closeEditingHandler = useCallback(()=>setEditingCategoryId(''), [setEditingCategoryId])

    return (
        <>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                <Link to='/apps/notepad/' 
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </div>
            
            <h1 className='font-bold text-lg pt-2 pb-4'>Categories</h1>

            {editingCategoryId?
                <EditCategory categoryId={editingCategoryId} close={closeEditingHandler} />
            :
                <ViewCategoryList onSelect={setEditingCategoryId} />
            }
        </>
    )
}

export default DisplayCategories;

function ViewCategoryList(props: {onSelect: Dispatch<string>}) {

    let { onSelect } = props;

    let categories = useNotepadStore(state=>state.categories);

    let onSelectHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let value = e.currentTarget.value;
        onSelect(value);
    }, [onSelect]);

    let categoryElems = useMemo(()=>{

        let sortedCategories = [...categories];
        sortedCategories.sort(sortCategories);

        return sortedCategories.map((cat) => (
            <div key={cat.categorie_id}>
                <button value={cat.categorie_id} onClick={onSelectHandler}
                    className='underline font-bold pb-2'>
                        {cat.nom_categorie}
                </button>
            </div>
        ));
    }, [categories, onSelectHandler]);

    return (
        <>
            <button onClick={onSelectHandler} value='new'
                className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                    New category
            </button>

            <div className='pt-2'>
                {categoryElems}
            </div>
        </>
    )
}

function EditCategory(props: {categoryId: string, close: ()=>void}) {

    let { categoryId, close } = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let categories = useNotepadStore(state=>state.categories);

    let category = useMemo(()=>{
        return categories.filter(item=>item.categorie_id===categoryId).pop() || {} as NotepadCategoryType;
    }, [categories, categoryId]);

    let [hasChanged, setHasChanged] = useState(false);
    
    // Preload values for editing
    let [categoryName, setCategoryName] = useState(category.nom_categorie || '');
    let categoryNameOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let value = e.currentTarget.value;
        setCategoryName(value);
        setHasChanged(true);
    }, [setHasChanged, setCategoryName]);

    let [fields, setFields] = useState(category.champs || []);
    let fieldsChangeHandler = useCallback((e: ChangeEvent<HTMLInputElement | HTMLSelectElement> | MouseEvent<HTMLButtonElement>)=>{
        let idxString = e.currentTarget.dataset.idx;
        if(!idxString) throw new Error("idx dataset value missing from field");
        let idx = Number.parseInt(idxString);
        if(isNaN(idx)) throw new Error("idx dataset value is NaN");
        if(!fields[idx]) throw new Error("idx out of range");

        let { name, value } = e.currentTarget;
        // @ts-ignore
        let checked = e.currentTarget.checked as boolean | undefined;

        let fieldsCopy = [...fields];
        let fieldEntry = {...fieldsCopy[idx]}
        if(e.currentTarget.type === 'checkbox') {
            // @ts-ignore
            fieldEntry[name] = checked;
        } else if(e.currentTarget.type === 'number') {
            // @ts-ignore
            if(value === '') fieldEntry[name] = value;
            let valueNumber = Number.parseInt(value);
            if(!isNaN(valueNumber)) {
                // @ts-ignore
                if(valueNumber) fieldEntry[name] = valueNumber;
            }
        } else {
            // @ts-ignore
            fieldEntry[name] = value;
        }
        fieldsCopy[idx] = fieldEntry;
        setFields(fieldsCopy);
        setHasChanged(true);
    }, [setHasChanged, fields, setFields]);

    let fieldAddHandler = useCallback(()=>{
        // Initialize new field
        let emptyField = {
            nom_champ: '',
            code_interne: 'field_' + fields.length,
            type_champ: '',
            taille_maximum: 1000,
            requis: fields.length===0,
        };
        let updatedFields = [...fields, emptyField];
        setFields(updatedFields);
    }, [fields, setFields]);

    let fieldRemoveHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let value = Number.parseInt(e.currentTarget.value);
        if(isNaN(value)) throw new Error("Value idx NaN");
        let updatedFields = [...fields];
        updatedFields.splice(value, 1);
        setFields(updatedFields);
    }, [fields, setFields]);

    let saveHandler = useCallback(()=>{
        if(!workers) throw new Error("Workers not initialized");
        let version = category?.version || 1;

        let command = {
            version, nom_categorie: categoryName, champs: fields
        } as NotepadNewCategoryType;
        if(category.categorie_id) {
            // This is an update, reuse the categoryId
            command.categorie_id = category.categorie_id; 
        }

        workers.connection.notepadSaveCategory(command)
            .then(result=>{
                if(result.ok) {
                    close();
                } else {
                    console.error("Error saving group: ", result.err);
                }
            })
            .catch(err=>console.error("Error saving category", err));
    }, [workers, categoryName, fields, category, close]);

    return (
        <>
            <h1 className='font-bold text-lg pt-2 pb-4'>Edit Category</h1>

            <div className='grid grid-cols-1 sm:grid-cols-3'>
                <label>Category name</label>
                <input value={categoryName} onChange={categoryNameOnChange} 
                    className='text-black sm:col-span-2' />
            </div>

            <div className='grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 pt-4 pb-2'>
                <div className='font-bold'>Delete</div>
                <div className='font-bold col-span-3 md:col-span-4'>Name</div>
                <div className='font-bold col-span-2 md:col-span-2'>Field code</div>
                <div className='font-bold col-span-2 md:col-span-2'>Type</div>
                <div className='font-bold col-span-2 md:col-span-2'>Max length</div>
                <div className='font-bold col-span-2 md:col-span-1'>Required?</div>

                <EditFields fields={fields} onChange={fieldsChangeHandler} remove={fieldRemoveHandler} />
            </div>

            <button onClick={fieldAddHandler}
                className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    + Add field
            </button>

            <div className='col-span-12 text-center pt-4'>
                <button onClick={saveHandler} disabled={!ready || !hasChanged}
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        Save
                </button>
                <button onClick={close}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Cancel
                </button>
            </div>
        </>
    )
}

type EditFieldsProps = {
    fields: Array<NotepadCategoryFieldType>, 
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement> | MouseEvent<HTMLButtonElement>)=>void, 
    remove: (e: MouseEvent<HTMLButtonElement>)=>void
}

function EditFields(props: EditFieldsProps) {

    let { fields, onChange, remove } = props;

    let fieldElems = useMemo(()=>{
        return fields.map((item, idx) => {
            return (
                <Fragment key={idx}>
                    <button onClick={remove} value={''+idx}
                        className='varbtn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 mr-6 mt-10 md:mt-0'>X</button>
                    <input name='nom_champ' value={item.nom_champ} data-idx={idx} onChange={onChange}
                        className='text-black col-span-3 md:col-span-4 mt-10 md:mt-0'/>
                    <input name='code_interne' value={item.code_interne} data-idx={idx} onChange={onChange}
                        className='text-black col-span-2 sm:mt-10 md:mt-0' />
                    <FieldTypeSelect name='type_champ' value={item.type_champ} data-idx={idx} onChange={onChange} idx={idx}
                        className='text-black col-span-2 md:col-span-2' />
                    <input type='number' name='taille_maximum' min={0} max={5000000} value={item.taille_maximum} data-idx={idx} onChange={onChange}
                        className='text-black col-span-2 md:col-span-2' />
                    <div className='w-full text-center col-span-2 md:col-span-1'>
                        <input type='checkbox' name='requis' data-idx={idx} checked={!!item.requis} onChange={onChange} />
                    </div>
                </Fragment>
            );
        });
    }, [fields, onChange, remove]);

    return (
        <>{fieldElems}</>
    )
}

function FieldTypeSelect(props: {name: string, value: string, className?: string, idx: number, onChange: (e: ChangeEvent<HTMLSelectElement>)=>void}) {
    let { name, value, className, onChange, idx } = props;

    return (
        <select name={name} value={value} onChange={onChange} className={'text-black '+className} data-idx={idx}>
            <option>Select a field type</option>
            <option value='text'>Text</option>
            <option value='password'>Password</option>
            <option value='url'>Url</option>
            <option value='number'>Number</option>
            <option value='html'>Html Editor</option>
            <option value='markdown'>Markdown Editor</option>
        </select>
    )
}

export function sortCategories(a: NotepadCategoryType, b: NotepadCategoryType, language?: string) {
    language = language || navigator.languages[0] || navigator.language;
    let labelA = (a.nom_categorie || a.categorie_id).toLocaleLowerCase();
    let labelB = (b.nom_categorie || b.categorie_id).toLocaleLowerCase();
    return labelA.localeCompare(labelB, language, {numeric: true, ignorePunctuation: true});
}
