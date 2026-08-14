import React, { useState } from 'react';

function TaskInput({ addTask }: { addTask: (task: string) => void }) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inputValue.trim() !== '') {
      addTask(inputValue.trim());
      setInputValue('');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type='text' value={inputValue} onChange={(event) => setInputValue(event.target.value)} />
      <button type='submit'>Add Task</button>
    </form>
  );
}

export default TaskInput;
