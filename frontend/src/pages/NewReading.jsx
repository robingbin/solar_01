import ReadingForm from "@/components/ReadingForm";

const NewReading = () => {
  return (
    <div className="max-w-3xl mx-auto" data-testid="new-reading-page">
      <ReadingForm onSaved={() => {}} />
    </div>
  );
};

export default NewReading;
